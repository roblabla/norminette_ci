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

const process_pr = async function process_pr(repo_name, repo_url, pr_number) {
  var cwd = path.join(os.tmpdir(), `norminette_ci_${uuid.v4()}`);
  let hash;
  await mkdirp(cwd);
  try {
    await exec('git', ('init').split(" "), { cwd });
    await exec('git', ('remote add origin ' + repo_url).split(" "), { cwd });
    await exec('git', ('fetch origin pull/' + pr_number + '/head:pr-' + pr_number).split(' '), { cwd });
    await exec('git', ('checkout pr-' + pr_number).split(' '), { cwd });
    await exec('git', ('submodule init').split(' '), { cwd });
    await exec('git', ('submodule update --init --recursive').split(' '), { cwd });
    ({ stdout: hash } = await exec('git', ('rev-parse HEAD').split(' '), { cwd }));
  } catch (e) {
    console.error(e.stdout);
    console.error(e.stderr);
    throw e;
  }
  await promisify(::(octonode.repo(repo_name).status))(hash, {
    state: "pending",
    description: "Norme",
    context: "norminette"
  });
  let ignorestr = "";
  try {
    ignorestr = await fs.readFile(path.join(cwd, '.norminette_ignore'), 'utf8');
  } catch (e) {
    // Do nothing, maybe .gitignore doesn't exist :D
  }
  let gitignore = gitignore_parser.compile(ignorestr);
  let norminette = await createNorminette();
  let globber = new EventEmitterIterator(new glob.Glob('**/*.{c,h}', { cwd, nodir: true }), "match", "end");
  let [result, success] = await (globber::asyncIterator.filter(async function(item) {
    let accepts = gitignore.accepts(item[0]);
    return accepts;
  })::asyncIterator.map(async function(item) {
    return await promisify(norminette.sendFile)(item[0], await fs.readFile(path.join(cwd, item[0])), null);
  })::asyncIterator.reduce(async function([str, res], item) {
    let display = item.display ? `\n${item.display}` : "";
    return [`${str}\nNorme: ${item.filename}${display}`, res && !item.display];
  }, ["", true]));
  let [data, headers] = await promisify(::(octonode.gist().create), { multiArgs: true })({
    description: "Norminette check",
    public: true,
    files: {
      "norme.txt": { "content": result }
    }
  });
  var [data2, headers2] = await promisify(::(octonode.repo(repo_name).status), { multiArgs: true })(hash, {
    state: success ? "success" : "failure",
    target_url: data.html_url,
    description: "Norme",
    context: "norminette"
  });
  norminette.close();
  /*return data.html_url;*/
}

/*app.post('/event_handler', require('body-parser').json(), function(req, res, next) {
  if (req.get('X-GITHUB-EVENT') === 'pull_request' && (req.body.action === "opened" || req.body.action === "synchronize"))
  {
    process_pr(req.body.pull_request.base.repo.full_name,
               req.body.pull_request.base.repo.clone_url,
               req.body.pull_request.number,
               req.body.pull_request.head.sha).then(function() {
      return res.status(200).end();
    }).catch(function(err) {
      if (err.stack) console.error(err.stack);
      else           console.error(err);
      return res.status(500).end();
    });
  }
  else if (req.get('X-GITHUB-EVENT') === 'push') {

  }
  return res.status(406).end();
});

app.listen(9999);*/

process_pr("roblabla42/RT", "https://github.com/roblabla42/RT.git", 13).then(function() {
  console.log("done");
}).catch(function(err) {
  setImmediate(function() { throw err; });
});
