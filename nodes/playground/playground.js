/*eslint-env node, querystring*/
/**
 * Copyright 2014 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
module.exports = function(RED) {
    "use strict";

    var bodyParser = require("body-parser");
    var cookieParser = require("cookie-parser");
    var jsonParser = bodyParser.json();
    var urlencParser = bodyParser.urlencoded({extended:true});

    var http = require("http");
    var querystring = require('querystring');

    var fs = require("fs");
    var AdmZip = require("adm-zip");

    var nodeEnd = "\n\n\
if (require.main === module) {      \
    process(parameters,null);       \
} else {                            \
    var unitpath = '';              \
    var superglue = require('../lib/superglue.js'); \
    module.exports = {              \
        path: '/' + unitpath,       \
        priority: 1,                \
        init: function (app) {},    \
        GET:  function(req, res) { superglue.GET(req,res,parameters,unitpath) }, \
        POST: function(req, res) { superglue.POST(req,res,process) }             \
    }                               \
}";

    var javaImports = "\n\n\
import javax.servlet.annotation.WebServlet; \
import com.google.gson.Gson;                \
import com.google.gson.GsonBuilder;         \
import com.google.gson.JsonObject;          \
import com.google.gson.JsonParser;          \
    ";
    
    var javaStart = "\n\n\
@WebServlet(\"/\")                          \
public class Snippet extends SuperGluev2 {  \
    ";

    var javaEnd = "\n\n\
    public static void main(String[] args) {    \
        Snippet snippet = new Snippet();        \
        JsonObject processResult = snippet.process(snippet.parameters); \
        Gson gson = new GsonBuilder().setPrettyPrinting().create();     \
        System.out.println(gson.toJson(processResult));                 \
    }                                           \
                                                \
    @Override                                   \
    JsonObject getParameters() {                \
        return new JsonParser().parse(parameters).getAsJsonObject();    \
    }                                           \
                                                \
    private static final long serialVersionUID = 1L;                    \
}                                               \
    ";
    
    function PlaygroundNode(n) {
        RED.nodes.createNode(this, n);
        var node = this;
        var jars = n.jars || "";
        var imports = n.imports || "";
        var code = n.code || "";
        var mode = n.mode || "node";
        var defaults = n.params || {};
        var url = n.url;

        this.on("input", function(msg) {
            var params = {};
            var payload = msg.payload;
            if (typeof payload == "object") {
                params = payload;
                for (var i in defaults) {
                    params[defaults[i].key] = params[defaults[i].key] || defaults[i].value;
                }
            } else {
                params.payload = payload;
            }
            executeParams(url, mode, code, imports, jars, params, function(data) {
                msg.payload = data;
                node.send(msg);
                node.status({});
            });
        });

        HTTPIn(node, n);
        HTTPInDownload(node, n);
    }
    RED.nodes.registerType("playground", PlaygroundNode);

    function execute(host, mode, code, cb) {
        if (code != "") {
            host = host || "cloudsandbox.mybluemix.net";
            host = host.replace("http://", "");
            if (host == "") host = "cloudsandbox.mybluemix.net";
            
            var post_data = querystring.stringify({
                'code': code,
                'language': mode
            });

            var post_options = {
                host: host,
                port: '80',
                path: '/exec',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(post_data)
                }
            };

            var post_req = http.request(post_options, function(post_res) {
                var data = "";
                post_res.setEncoding('utf8');
                post_res.on('data', function(chunk) {
                    data += chunk;
                });
                post_res.on('end', function() {
                    console.log("result : " + data);
                    if (data.indexOf("err") > -1 && data.indexOf("out") > -1) {
                        try {
                            cb(JSON.parse(data));
                        } catch (e) {
                            cb({err: data, out: ""});
                        }
                        return;
                    } else {
                        cb({err: data, out: ""});
                        return;
                    }
                });
            });

            post_req.on('error', function(err) {
                console.log(err);
                cb({err: err, out: ""});
            });

            post_req.write(post_data);
            post_req.end();
        }
    }

    function executeParams(host, mode, code, imports, jars, params, cb) {
        if (mode == "node") {
            var paramLines = "var parameters = " + JSON.stringify(params) + ";\n\n";
            execute(host, mode, paramLines + code + nodeEnd, cb);
        } else if (mode == "java") {
            var jarLines = "//jar@" + jars + "\n\n";
            var paramLines = "public String parameters = \"" + JSON.stringify(params).replace(/\"/g, "'") + "\";\n\n";
            execute(host, mode, jarLines + javaImports + imports + javaStart + paramLines + code + javaEnd, cb);
        }
    }

    function downloadNode(name, code, cb) {
        var folder = process.env.HOME + "/package-templates/node/";
        name = name.replace(/[^0-9a-z]/gi, " ").replace(/\s/g, "-").toLowerCase();
        var manifest_yml     = fs.readFileSync(folder + 'manifest.yml','utf8');
        var package_json     = fs.readFileSync(folder + 'package.json','utf8');
        var src_snippet_js   = code;
        var packageJson = JSON.parse(package_json);
        packageJson.name = name;

        var codePackages = code.split("require(");
        if (codePackages.length > 1) {
            for (var i in codePackages) {
                if (i == 0) continue;
                var package_ = codePackages[i].substring(0,codePackages[i].indexOf(")")).replace(/\"/g,"").replace(/\'/g,"");
                if (package_ != "" && package_ != "../lib/superglue.js") {
                    if (typeof packageJson.dependencies[package_] == "undefined")
                        packageJson.dependencies[package_] = "*";
                }
            }
        }
        package_json = JSON.stringify(packageJson, null, 4);

        manifest_yml = manifest_yml.replace(/{{name}}/g, name);

        var zip = new AdmZip();
        zip.addLocalFile("app.js", "app.js");
        zip.addFile("manifest.yml", new Buffer(manifest_yml), "manifest.yml");
        zip.addFile("package.json", new Buffer(package_json), "package.json");
        zip.addLocalFile(folder + "/README.txt", "");
        zip.addLocalFile(folder + "/lib/superglue.js", "lib");
        zip.addLocalFile(folder + "/public/style.css", "public");
        zip.addFile("src/snippet.js", new Buffer(src_snippet_js), "snippet.js");

        cb({
            err : "",
            out : {
                zip : zip.toBuffer(),
                name : name
            }
        });
    }

    function downloadJava(name, code, cb) {
        var folder = process.env.HOME + "/package-templates/java/";
        name = name.replace(/[^0-9a-z]/gi, " ").replace(/\s/g, "-").toLowerCase();
        var manifest_yml     = fs.readFileSync(folder + 'manifest.yml','utf8');
        var pom_xml          = fs.readFileSync(folder + 'pom.xml','utf8');
        var snippet_java     = code;

        manifest_yml = manifest_yml.replace(/{{name}}/g, name);
        pom_xml = pom_xml.replace(/{{name}}/g, name);

        var zip = new AdmZip();
        zip.addFile("manifest.yml", new Buffer(manifest_yml), "manifest.yml");
        zip.addFile("pom.xml", new Buffer(pom_xml), "pom.xml");
        zip.addLocalFile(folder + "README.txt", "");
        zip.addLocalFile(folder + "libs/com/ibm/sample/super-glue/1.0.1/super-glue-1.0.1.jar", "libs/com/ibm/sample/super-glue/1.0.1");
        zip.addFile("src/main/java/Snippet.java", new Buffer(snippet_java), "Snippet.java");

        cb({
            err : "",
            out : {
                zip : zip.toBuffer(),
                name : name
            }
        });
    }

    // from core/io/httpin.js
    function HTTPIn(node, n) {
        var skip = function(req,res,next) { next(); }

        node.callback = function(req,res) {
            var msgid = RED.util.generateId();
            res._msgid = msgid;

            var host = req.body.host || "cloudsandbox.mybluemix.net";
            var code = req.body.code || "";
            var mode = req.body.mode || "node";

            execute(host, mode, code, function(data) {
                var msg = {
                    _msgid: msgid,
                    req: req,
                    res: res,
                    payload: data
                };
                node.send(msg);
                node.status({});
                res.send(data);
            });
        };

        node.errorHandler = function(err,req,res,next) {
            node.warn(err);
            res.send({err:err,out:""});
        };

        console.log("adding /playground/execute post path");
        RED.httpNode.post("/playground/execute",cookieParser(),skip,skip,skip,jsonParser,urlencParser,skip,node.callback,node.errorHandler);
    }
    
    // from core/io/httpin.js
    function HTTPInDownload(node, n) {
        var skip = function(req,res,next) { next(); }

        node.callback = function(req,res) {
            var msgid = RED.util.generateId();
            res._msgid = msgid;

            var name = req.body.name || "";
            var code = req.body.code || "";
            var mode = req.body.mode || "node";

            if (code == "") {
            	res.send({err:"Code is empty", out:""});
            	return;
            }            
        
            if (mode == "node") {
            downloadNode(name, code, function(data) {
                var msg = {
                    _msgid: msgid,
                    req: req,
                    res: res,
                    payload: data
                };
                node.send(msg);
                node.status({});
               
                if (data.out.err) {
                    res.send(data.out.err);
                } else {
                    res.contentType('application/zip');
                    res.setHeader('content-disposition','attachment; filename=' + data.out.name + '.zip');
                    res.send(data.out.zip);
                }
            });
            } else if (mode == "java") {
            downloadJava(name, code, function(data) {
                var msg = {
                    _msgid: msgid,
                    req: req,
                    res: res,
                    payload: data
                };
                node.send(msg);
                node.status({});
               
                if (data.out.err) {
                    res.send(data.out.err);
                } else {
                    res.contentType('application/zip');
                    res.setHeader('content-disposition','attachment; filename=' + data.out.name + '.zip');
                    res.send(data.out.zip);
                }
            });
            }
        };

        node.errorHandler = function(err,req,res,next) {
            node.warn(err);
            res.send({err:err,out:""});
        };

        console.log("adding /playground/download post path");
        RED.httpNode.post("/playground/download",cookieParser(),skip,skip,skip,jsonParser,urlencParser,skip,node.callback,node.errorHandler);
    }
}

