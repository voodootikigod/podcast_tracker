var nodestatic = require('node-static');
var sys = require("sys");
var redis = require("redis");
var config = require("./config");
var http = require("http");



var fileServer = new nodestatic.Server(config.directory);
sys.p(fileServer)
client = redis.createClient();

require('http').createServer(function (request, response) {
  request.addListener('end', function () {
    sys.puts(request.url);
    if (request.url == "/") {
      response.writeHead(301, {"Location": config.redirect});
      response.end();
    } else if (request.url == "/statistics.json")  {
      client.keys("podcast:*", function (err, res) {
        var length = res.length, count = 0, results = {};
        res.forEach(function (item) { 
          client.get(item, function (err, resp) {
            results[item] = parseInt(resp.toString('utf8'));
            count += 1
            if (count == length) { 
              response.writeHead(200, {"Content-Type": "application/json"})
              response.end(JSON.stringify({
                headers: config.headers,
                data:    results
              }));
            }
          });
        })
      })
    } else {
      fileServer.serve(request, response, function (err, results) {
        if (err && (err.status === 404)) { // If the file wasn't found
          sys.puts("404 -> redirected")
          response.writeHead(301, {"Location": config.redirect});
          response.end();
        } else { 
          file_parts = request.url.split("/");
          filename = file_parts[file_parts.length-1];
          sys.puts("sending file: "+filename);
          if (/(mp3|ogg)$/.exec(request.url)) {
            client.incr("podcast:"+filename);
            client.incr("podcast:"+filename.split(".")[0]);
          }
        }
      });
    }
  });
}).listen(config.port);