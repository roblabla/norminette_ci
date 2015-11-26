var amqp = require('amqplib/callback_api');
var uuid = require('uuid');

// TODO : One day, the norminette will send back the correlationId... one day...
var createNorminette = module.exports = function createNorminette(cb) {
  amqp.connect('amqp://norminette.42.fr', function(err, conn) {
    if (err)
      return cb(err);
    conn.createChannel(function(err, ch) {
      if (err)
        return cb(err);
      ch.assertQueue('', { exclusive: true }, function(err, ok) {
        if (err)
          return cb(err);
        var arr = new Map();
        ch.consume(ok.queue, function(msg) {
          try {
            var p = JSON.parse(msg.content.toString());
          } catch (e) {
            // TODO : Might want to react in a better way. Maybe close ?
            return;
          }
          let name = p.filename ? p.filename : "help";
          let cb = arr.get(name);
          arr.delete(name);
          if (cb != null) cb(null, p);
        });
        cb(null, { sendFile: sendFile.bind(null, conn, ch, ok.queue, arr),
                   close: close.bind(null, conn, ch, ok.queue, arr),
                   help: help.bind(null, conn, ch, ok.queue, arr),
                   getRules: getRules.bind(null, conn, ch, ok.queue, arr), });
      });
    });
  });
};

function close(connection, ch, queue, arr) {
  for (let elem of arr) {
    elem[1](new Error('Connection closed'));
  }
  ch.close();
  connection.close();
}

function sendFile(connection, ch, queue, arr, filename, filebuf, rules, cb) {
  var opts = { filename: filename, content: filebuf.toString() };
  var id = uuid.v4();
  if (rules != null)
    opts.rules = rules;
  arr.set(filename, cb);
  // TODO : Should I set a timeout ? I probably should...
  ch.sendToQueue('norminette', new Buffer(JSON.stringify(opts)), { replyTo: queue, correlationId: id });
};

function help(connection, ch, queue, arr, cb) {
  var opts = { action: "help" };
  var id = uuid.v4();
  arr.set("help", cb);
  ch.sendToQueue('norminette', new Buffer(JSON.stringify(opts)), { replyTo: queue, correlationId: id });
}

function getRules(connection, ch, queue, arr, cb) {
  var opts = { action: "help" };
  var id = uuid.v4();
  arr.set("help", function (err, res) {
    if (err) return cb(err);
    cb(null, res.display.split("\n")[1].split(" "));
  });
  ch.sendToQueue('norminette', new Buffer(JSON.stringify(opts)), { replyTo: queue, correlationId: id });
}
/*
createNorminette(function(err, norminette) {
  console.log("Sending");
  norminette.help(function(err, help) {
    if (err)
      return console.log(err);
    else {
      let rules = help.display.split("\n")[1].split(" ");
      for (let rule of rules) {
        norminette.sendFile(`github_${rule}.c`.toLowerCase(), file, [rule], function (err, msg) {
          console.log(msg);
        });
      }
    }
  });
});*/
