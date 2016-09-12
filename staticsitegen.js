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
var config;
try {
    config = readRawFile(path.join(input, ".config"));
} catch (err) {
    console.error(err);
    config = {};
}
var allRaws = [];

file.walkSync(input, function(start, dirs, names) {
    {
        let filtered = dirs.filter(x => x[0] != '.');
        Array.prototype.splice.apply(dirs,
            [0, dirs.length].concat(filtered));
    }

    var relStart = path.relative(input, start);
    var outStart = path.join(output, relStart);

    names.forEach(function(fileName) {
        if(fileName[0] == '.')
            return;
        var ext = path.extname(fileName);
        var inFile = path.join(start, fileName);
        try {
            if(ext != ".raw") {
                let outFile = path.join(outStart, fileName);
                file.mkdirsSync(outStart);
                copyFile(inFile, outFile);
            } else {
                let raw = readRawFile(inFile);
                raw.outFile = path.join(outStart, raw.path);
                raw.webPath = path.join(relStart, raw.path);
                allRaws.push(raw);
            }
        } catch (err) {
            console.error(err);
        }
    });
});

allRaws.forEach(function(raw) {
    var templatePath = path.join(input, ".template", raw.template);
    var template = readTemplate(templatePath);
    var result = template(Object.assign({}, config, raw, {
        allRaws: allRaws,
        dateFormat: dateFormat,
    }));
    if(!raw.nohighlight)
        result = highlight(result);

    var outFile = raw.outFile;
    try {
        file.mkdirsSync(path.dirname(outFile));
        fs.writeFile(outFile, result,
                 err => err && console.error(err));
    } catch (err) {
        console.error(err);
    }
});

;
})();
