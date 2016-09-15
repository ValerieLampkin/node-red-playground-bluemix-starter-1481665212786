var express = require('express'),
http = require('http'),
path = require('path'),
DynamicRoutes = require('dynamic-routes'),
app = express(),
bodyParser = require('body-parser');

app.set('port', process.env.PORT || 3000);

app.use(bodyParser());
app.use(express.static(path.join(__dirname, 'public')));

DynamicRoutes(app, __dirname + '/src/');

http.createServer(app).listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));
});