//helper section allows module to be tested easily as forms
//get displays forms, and submit on the form as post
//shows processed results
module.exports = {
		GET: function(req, res, params, unitpath) {

			//console.log({ path: [req.params, req.query, req.body]});

			var forms = require('forms');
			var fields = forms.fields;

			var result = [];
			for (var p in params) {
				if( params.hasOwnProperty(p) ) {
					result[p] = fields.string({ required: true }); // obj[p]
				}
			}

			var htmlstr = "<html>\n" +
			"<head>\n" + 
			"<title>Node.js Snippet Form</title>\n" +
			"<link href='/style.css' rel='stylesheet' />\n" + 
			"</head>\n" +
			"<body>\n" +
			"<h1>Node.js Snippet Form</h1>\n" +
			"<form action=\"" + unitpath + "\" method=\"POST\">\n" +
			forms.create(result).toHTML() +
			"\n<button type=\"submit\">Submit</button>\n" +
			"</form>\n" +
			"</body>\n" +
			"</html>";

			//console.log(htmlstr);

			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.write(htmlstr);
			res.end();
		},

		POST: function(req, res, process) {
			//console.log({'input': [req.params, req.query, req.body]});
			// ensure ALL MANDATORY params are passed via req.body
			params = req.body;

			process(params,function(err, data) {
				if (err) res.json(err); else res.json(data);
			});
		}

}