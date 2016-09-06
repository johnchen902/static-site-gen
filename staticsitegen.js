#!/usr/bin/env node
(function() {
;

const argv = require("minimist")(process.argv.slice(2), {
    alias : { "i" : "input" }
});
const file = require("file");
const fs = require("fs");
const path = require("path");
const dot = require("dot");
const htmlparser2 = require("htmlparser2");
const Prism = require("prismjs");
require("prismjs/components/prism-c");
require("prismjs/components/prism-cpp");
const dateFormat = require("dateformat");

function copyFile(src, dest) {
    var rd = fs.createReadStream(src);
    rd.on("error", err => console.error(err));
    var wr = fs.createWriteStream(dest);
    wr.on("error", err => console.error(err));
    rd.pipe(wr);
}

function readRawFile(src) {
    // the format is like HTTP/1.1
    result = {};
    content = fs.readFileSync(src, {encoding:"utf-8"});
    lines = content.split('\n');
    var i;
    for(i = 0; lines[i]; i++) {
        if(lines[i][0] == '#')
            continue;
        let arr = lines[i].split(':');
        let field = arr[0].trim().toLowerCase();
        let data = arr.slice(1).join(':').trim();
        result[field] = data;
    }
    result.content = lines.slice(i + 1).join('\n');
    return result;
}

function readTemplate(src) {
    return dot.template(fs.readFileSync(src, {encoding:"utf-8"}),
            Object.assign({}, dot.templateSettings, {strip:!1}));
}

function highlightText(text) {
    return Prism.highlight(text, Prism.languages.cpp);
}

function highlight(data) {
    var level = 0, index, code, offset = 0;
    var parser = new htmlparser2.Parser({
        onopentag: function (name, attribs) {
            if(name === "code" && level++ == 0) {
                index = parser.endIndex + 1;
                code = "";
            }
        },
        ontext: function(text) {
            if(level)
                code += text;
        },
        onclosetag: function (name) {
            if(name === "code" && --level == 0) {
                let highlighted = highlightText(code);
                let index2 = parser.startIndex;
                data = data.substring(0, index + offset) +
                    highlighted + data.substring(index2 + offset);
                offset += highlighted.length - (index2 - index);
            }
        }
    }, {decodeEntities: true});
    parser.write(data);
    parser.end();
    return data;
}

var input = argv.input || "input";
var output = argv.output || "output";
var site = argv.site || "/blog";
var allRaws = [];

file.walkSync(input, function(start, dirs, names) {
    {
        let index = dirs.indexOf("_template");
        if(index > -1)
            dirs.splice(index, 1);
    }

    var relStart = path.relative(input, start);
    var outStart = path.join(output, relStart);
    file.mkdirsSync(outStart);
    try {
        if(!fs.lstatSync(outStart).isDirectory()) {
            dirs.length = 0;
            return;
        }
    } catch (err) {
        console.error(err);
        dirs.length = 0;
        return;
    }

    names.forEach(function(fileName) {
        var ext = path.extname(fileName);
        var inFile = path.join(start, fileName);
        if(ext != ".raw") {
            let outFile = path.join(outStart, fileName);
            copyFile(inFile, outFile);
        } else {
            try {
                let raw = readRawFile(inFile);
                raw.site = site;
                allRaws.push(raw);

                let templatePath = path.join(
                        input, "_template", raw.template);
                let template = readTemplate(templatePath);
                let result = template(raw);
                raw.output = result = highlight(result) || result;

                let outFile = path.join(outStart, raw.path);
                raw.webpath = path.join(relStart, raw.path);
                file.mkdirsSync(path.dirname(outFile));
                fs.writeFile(outFile, result,
                        err => err && console.error(err));
            } catch (err) {
                console.error(err);
            }
        }
    });
});
try {
    let templatePath = path.join(input, "_template", "index");
    let template = readTemplate(templatePath);
    let result = template({
        raws: allRaws,
        dateFormat: dateFormat,
        site: site,
    });
    result = highlight(result) || result;

    let outFile = path.join(output, "index.html");
    fs.writeFile(outFile, result,
                 err => err && console.error(err));
} catch(err) {
    console.error(err);
}

;
})();
