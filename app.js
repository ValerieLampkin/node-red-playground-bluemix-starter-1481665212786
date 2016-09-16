var http = require('http');
var express = require("express");
var RED = require("node-red");

require("cf-deployment-tracker-client").track();    // deployment tracker

//Create an Express app
var app = express();

//Create a server
var server = http.createServer(app);

//Use Bluemix's settings object
var settings = require("./bluemix-settings");

//Initialise the runtime with a server and settings
RED.init(server,settings);

//Serve the editor UI from /red
app.use(settings.httpAdminRoot, RED.httpAdmin);

//Serve the http nodes UI from /api
app.use(settings.httpNodeRoot || "/",RED.httpNode);

//Add a simple route for static content served from 'public'
app.use("/",express.static("public"));

function getListenPath() {
	var listenPath = 'http'+(settings.https?'s':'')+'://'+
	(settings.uiHost == '0.0.0.0'?'127.0.0.1':settings.uiHost)+
	':'+settings.uiPort;
	if (settings.httpAdminRoot !== false) {
		listenPath += settings.httpAdminRoot;
	} else if (settings.httpStatic) {
		listenPath += "/";
	}
	return listenPath;
}


RED.start().then(function() {
	if (settings.httpAdminRoot !== false || settings.httpNodeRoot !== false || settings.httpStatic) {
		server.on('error', function(err) {
			if (err.errno === "EADDRINUSE") {
				RED.log.error(RED.log._("server.unable-to-listen", {listenpath:getListenPath()}));
				RED.log.error(RED.log._("server.port-in-use"));
			} else {
				RED.log.error(RED.log._("server.uncaught-exception"));
				if (err.stack) {
					RED.log.error(err.stack);
				} else {
					RED.log.error(err);
				}
			}
			process.exit(1);
		});
		server.listen(settings.uiPort,settings.uiHost,function() {
			if (settings.httpAdminRoot === false) {
				RED.log.info(RED.log._("server.admin-ui-disabled"));
			}
			process.title = 'node-red';
			RED.log.info(RED.log._("server.now-running", {listenpath:getListenPath()}));
		});
	} else {
		RED.log.info(RED.log._("server.headless-mode"));
	}
}).otherwise(function(err) {
	RED.log.error(RED.log._("server.failed-to-start"));
	if (err.stack) {
		RED.log.error(err.stack);
	} else {
		RED.log.error(err);
	}
});

