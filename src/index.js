#!/usr/bin/env node

var express = require('express');
var child_process = require('child_process');
var exec = require('teen_process').exec;
var os = require('os');
var path = require('path');
var uuid = require('uuid');
var promisify = require('pify');
var mkdirp = promisify(require('mkdirp'));
var octonode = require('octonode').client(process.env.GITHUB_API_KEY);
var glob = promisify(require('glob'));
var _ = require('highland');
var app = express();

app.use(require('morgan')('dev'));

const process_pr = async function process_pr(repo_name, repo_url, pr_number, hash) {
  await promisify(::(octonode.repo(repo_name).status))(hash, {
    state: "pending",
    description: "Norme",
    context: "norminette"
  });
  var cloneFolder = path.join(os.tmpdir(), `norminette_ci_${uuid.v4()}`);
  await mkdirp(cloneFolder);
  process.chdir(cloneFolder);
  await exec('git', ['init']);
  await exec('git', ('remote add origin ' + repo_url).split(" "));
  await exec('git', ('fetch origin pull/' + pr_number + '/head:pr-' + pr_number).split(' '));
  await exec('git', ('checkout pr-' + pr_number).split(' '));
  await exec('git', ('submodule init').split(' '));
  await exec('git', ('submodule update --init --recursive').split(' '));
  var files = await glob('**/*.c');
  var child = child_process.spawn(`norminette`, files, {
    stdio: [0, 'pipe', 'pipe']
  });
  let [success, result] = await new Promise((resolve, reject) => {
    let x = true;
    var str = "";
    _(child.stdout).split().each((line) => {
      str += line + "\n";
      if (line !== "" && !line.startsWith("Norme"))
        x = false;
    }).stopOnError((err) => {
      reject(err);
    }).done(() => {
      resolve([x, str]);
    });
  });
  var [data, headers] = await promisify(::(octonode.gist().create), { multiArgs: true })({
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
  return data.html_url;
}

app.post('/event_handler', require('body-parser').json(), function(req, res, next) {
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
  else
    return res.status(406).end();
});

app.listen(9999);
