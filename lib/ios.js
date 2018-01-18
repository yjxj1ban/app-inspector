'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const XCTestWD = require('xctestwd');
const Simulator = require('ios-simulator');

const _ = require('./common/helper');
const logger = require('./common/logger');

function reportNodesError(source) {
  return chalk.red(
    `The source may be wrong, please report with below message at:
    ${chalk.blue('https://github.com/macacajs/app-inspector/issues/new')}
    ****** xctest source start *******
    ${JSON.stringify(JSON.parse(source))}
    '****** xctest source end *******`
  );
}

// add by yangjuan,
// 全局变量,以及深复制
var typeCollection = {}
function deepClone(initalObj) {
    var obj = {};
    try {
        obj = JSON.parse(JSON.stringify(initalObj));
    }catch(e){
        logger.info("deepClon exception");
    }
    return obj;
}
var backTypeCollection;
// end add by yangjuan

const adaptor = function(node) {
  node.class = `XCUIElementType${node.type}`;

  const rect = node.rect;
  node.bounds = [
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  ];

// add by yangjuan
  if (node.type in typeCollection){
    typeCollection[node.type] = typeCollection[node.type] + 1;
  }else{
    typeCollection[node.type] = 0
  }
  // end add by yangjuan 


  if (node.children) {
    const children = node.children.length ? node.children : [node.children];

    var nodes = [];
    children.forEach(child => {
      if (child.isVisible || child.type !== 'Window') {
        nodes.push(adaptor(child));
      }
    });

    node.nodes = nodes;
    delete node.children;
  }
  return node;
};

var xctest;


// add by yangjuan,一个递归函数，从上到下对每个节点加序号
function addSequenceHandle(simpleTree){
  // 给class添加序号
  var nodeTemp = simpleTree['type']

  if(nodeTemp in typeCollection){

    if (typeCollection[nodeTemp] >= 0){

    typeCollection[nodeTemp] = typeCollection[nodeTemp] - 1
    var index = backTypeCollection[nodeTemp] -  typeCollection[nodeTemp] - 1;
    // 不考虑xpath的情况下：
    // 考虑xpath：
    simpleTree['type'] = simpleTree['type'] + '[' + index + ']';
    // simpleTree['type'] = 'XCUIElementType' + simpleTree['type'] + '[' + index + ']';
    }
    
  }
  // logger.info(simpleTree['type']);
  var Nodes = simpleTree['nodes'];

  if(Nodes == undefined){
        // logger.info("再也没有子node了");
      }else{
        for(var i=0;i<Nodes.length;i++){
            addSequenceHandle(Nodes[i]);
        }
  }
}
// end add by yangjuan


exports.dumpXMLAndScreenShot = function *() {
  const source = yield _.request(`http://${xctest.proxyHost}:${xctest.proxyPort}/wd/hub/source`, 'get', {});
  const tree = JSON.parse(source).value;
  const tempDir = path.join(__dirname, '..', '.temp');
  _.mkdir(tempDir);
  const xmlFilePath = path.join(tempDir, 'ios.json');

  let compatibleTree;
  try {
    compatibleTree = adaptor(tree);
    // add by yangjuan
    backTypeCollection = deepClone(typeCollection);
    logger.info("***end***");
    logger.info(typeCollection);
    // 将typeCollection保存到monkey.json，为了后续的monkey test==> 但是这个
    addSequenceHandle(compatibleTree);

    // end add by yangjuan 
  } catch(e) {
    console.error(reportNodesError(source));
    throw e;
  }

  fs.writeFileSync(xmlFilePath, JSON.stringify(compatibleTree), 'utf8');
  logger.debug(`Dump iOS XML success, save to ${xmlFilePath}`);

  const screenshot = yield _.request(`http://${xctest.proxyHost}:${xctest.proxyPort}/wd/hub/screenshot`, 'get', {});
  const base64Data = JSON.parse(screenshot).value;
  const imgFilePath = path.join(tempDir, 'ios-screenshot.png');
  fs.writeFileSync(imgFilePath, base64Data, 'base64');
};

exports.initDevice = function *(udid) {
  const isRealIOS = _.getDeviceInfo(udid).isRealIOS;

  var device;

  if (isRealIOS) {
    device = {
      deviceId: udid
    };
  } else {
    device = new Simulator({
      deviceId: udid
    });
  }

  xctest = new XCTestWD({
    proxyPort: 8001,
    device: device
  });

  try {
    yield xctest.start({
      desiredCapabilities: {}
    });
  } catch (e) {
    console.log(e);
  }

  logger.info(`iOS device started: ${udid}`);
};
