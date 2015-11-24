var amqp = require('amqplib/callback_api');

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
          let cb = arr.get(p.filename);
          arr.delete(p.filename);
          if (cb != null) cb(null, p);
        });
        cb(null, { sendFile: sendFile.bind(null, conn, ch, ok.queue, arr),
                   close: close.bind(null, conn, ch, ok.queue, arr) });
      });
    });
  });
};

function close(connection, ch, queue, arr) {
  for (let elem of arr) {
    if (elem != null) elem(new Error('Connection closed'));
  }
  ch.close();
  connection.close();
}

function sendFile(connection, ch, queue, arr, filename, filebuf, rules, cb) {
  var opts = { filename: filename, content: filebuf.toString() };
  if (rules != null)
    opts.rules = rules;
  arr.set(filename, cb);
  // TODO : Should I set a timeout ? I probably should...
  ch.sendToQueue('norminette', new Buffer(JSON.stringify(opts)), { replyTo: queue });
};

/*createNorminette(function(err, norminette) {
  console.log("Sending");
  norminette.sendFile('github.c', '// test', null, function(err, msg) {
    console.log(err);
    console.log(msg);
    norminette.close();
  });
});*/
