//#!/usr/bin/env node

let express = require('express');
let child_process = require('child_process');
let exec = require('teen_process').exec;
let fs = require('fs-promise');
let os = require('os');
let path = require('path');
let uuid = require('uuid');
let promisify = require('pify');
let mkdirp = promisify(require('mkdirp'));
let gitignore_parser = require('gitignore-parser');
let octonode = require('octonode').client(process.env.GITHUB_API_KEY);
let glob = require('glob');
let asyncIterator = require('./asyncIterator');
let EventEmitterIterator = require('./EventEmitterIterator');
let createNorminette = promisify(require('./norminette'));
let app = express();

app.use(require('morgan')('dev'));

const process_norminette = async function process_norminette(cwd) {
  let ignorestr = "";
  try {
    ignorestr = await fs.readFile(path.join(cwd, '.norminette_ignore'), 'utf8');
  } catch (e) {
    // Do nothing, maybe .norminette_ignore doesn't exist :D
  }
  let gitignore = gitignore_parser.compile(ignorestr);
  let norminette = await createNorminette();
  let globber = new EventEmitterIterator(new glob.Glob('**/*.{c,h}', { cwd, nodir: true }), { event: "match" });
  let [result, success] = await (globber
    ::asyncIterator.filter(async (item) => gitignore.accepts(item))
    ::asyncIterator.map(async (item) =>
      [item, (await fs.readFile(path.join(cwd, item))).toString()])
    ::asyncIterator.map(async ([filename, file]) => {
      let firstLine = file.substr(0, file.indexOf("\n")).replace(/\s/g, "");
      if (firstLine.startsWith("//rules:")) {
        let rules = firstLine.substr("//rules:".length).split(",");
        rules = (await promisify(::norminette.getRules)()).filter((item) => rules.indexOf(item) < 0);
        return [filename, file.substr(file.indexOf("\n") + 1), rules];
      } else if (firstLine.startsWith("//ignorerules:")) {
        let rules = firstLine.substr("//ignorerules:".length).split(",");
        return [filename, file.substr(file.indexOf("\n") + 1), rules];
      } else
        return [filename, file, null];
    })
    ::asyncIterator.map(async ([filename, file, rules]) =>
      await promisify(norminette.sendFile)(filename, file, rules))
    ::asyncIterator.reduce(async ([str, res], item) => {
      console.log(item.display);
      let display = item.display ? `\n${item.display}` : "";
      return [`${str}\nNorme: ${item.filename}${display}`, res && !item.display];
    }, ["", true]));
  norminette.close();
  return [result, success];
};

const git_clone = async function git_clone(repo_url, branchpath, branchname) {
  let hash;
  let cwd = path.join(os.tmpdir(), `norminette_ci_${uuid.v4()}`);
  await mkdirp(cwd);
  try {
    await exec('git', ('init').split(" "), { cwd });
    await exec('git', ('remote add origin ' + repo_url).split(" "), { cwd });
    await exec('git', ('fetch origin ' + branchpath + ':' + branchname).split(' '), { cwd });
    await exec('git', ('checkout ' + branchname).split(' '), { cwd });
    await exec('git', ('submodule init').split(' '), { cwd });
    await exec('git', ('submodule update --init --recursive').split(' '), { cwd });
    ({ stdout: hash } = await exec('git', ('rev-parse HEAD').split(' '), { cwd }));
  } catch (e) {
    console.error(e.stdout);
    console.error(e.stderr);
    throw e;
  }
  return { cwd, hash };
}

const process_push = async function process_push(repo_name, repo_url, ref) {
  let { cwd, hash } = await git_clone(repo_url, ref, 'curr_branch');
  await promisify(::(octonode.repo(repo_name).status))(hash, {
    state: "pending",
    description: "Norme",
    context: "norminette"
  });
  let [result, success] = await process_norminette(cwd);
  let [data, headers] = await promisify(::(octonode.gist().create), { multiArgs: true })({
    description: "Norminette check",
    public: true,
    files: {
      "norme.txt": { "content": result }
    }
  });
  await promisify(::(octonode.repo(repo_name).status), { multiArgs: true })(hash, {
    state: success ? "success" : "failure",
    target_url: data.html_url,
    description: "Norme",
    context: "norminette"
  });
}

app.get('/:owner/:repo/latest.txt', function(req, res, next) {
  (async function() {
    let x = octonode.repo(`${req.params.owner}/${req.params.repo}`);
    let stuff = await promisify(::x.statuses)('master');
    for (let status of stuff) {
      if (status.state === "success" || status.state === "failure") {
        return res.redirect(status.target_url);
      }
    }
  })().catch(function(err) {
    if (err.stack) console.error(err.stack);
    else           console.error(err);
    res.status(500).end();
  });
});

app.get('/:owner/:repo/badge.svg', function(req, res, next) {
  (async function() {
    let x = octonode.repo(`${req.params.owner}/${req.params.repo}`);
    let stuff = await promisify(::x.statuses)('master');
    let success = null;
    for (let status of stuff) {
      if (status.state === "success" || status.state === "failure") {
        success = status.state === "success";
        break;
      }
    }
    let status;
    let color;
    if (success == null) {
      status = "unknown";
      color = "lightgrey";
    } else if (success) {
      status = "passing";
      color = "green";
    } else {
      status = "failing";
      color = "red";
    }
    let qs = req.url.substr(req.url.indexOf('?') + 1);
    return res.redirect(`https://img.shields.io/badge/build-${status}-${color}.svg${qs}`);
  })().then(null, function(err) {
    if (err.stack) console.error(err.stack);
    else           console.error(err);
    res.status(500).end();
  });
});

app.post('/event_handler', require('body-parser').json(), function(req, res, next) {
  let promise;
  if (req.get('X-GITHUB-EVENT') === 'pull_request' &&
      (req.body.action === "opened" || req.body.action === "synchronize"))
  {
    promise = process_push(req.body.pull_request.base.repo.full_name,
                           req.body.pull_request.base.repo.clone_url,
                           `pull/${req.body.pull_request.number}/head`);
  }
  else if (req.get('X-GITHUB-EVENT') === 'push') {
    promise = process_push(req.body.repository.full_name,
                           req.body.repository.clone_url,
                           req.body.ref);
  } else
    return res.status(406).end();
  promise.then(function() {
    return res.status(200).end();
  }).catch(function(err) {
    if (err.stack) console.error(err.stack);
    else           console.error(err);
    return res.status(500).end();
  });
});

app.listen(9998);

/*(async function() {
  var cwd = path.join(os.tmpdir(), `norminette_ci_${uuid.v4()}`);
  await mkdirp(cwd);
  await exec('git', ('init').split(" "), { cwd });
  await exec('git', ('remote add origin https://github.com/roblabla/norminette_bugs.git').split(" "), { cwd });
  await exec('git', ('fetch origin master').split(' '), { cwd });
  await exec('git', ('checkout master').split(' '), { cwd });
  await exec('git', ('submodule init').split(' '), { cwd });
  await exec('git', ('submodule update --init --recursive').split(' '), { cwd });
  console.log(await process_norminette(cwd));
})().then(null, function(err) {
  setImmediate(() => { throw err; });
});*/

/*process_pr("roblabla42/RT", "https://github.com/roblabla42/RT.git", 13).then(function() {
  console.log("done");
}).catch(function(err) {
  setImmediate(function() { throw err; });
});*/
