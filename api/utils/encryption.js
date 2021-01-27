'use strict';

var CryptoJS = require("crypto-js");
exports.encryptAES = function (text) {
  var key = CryptoJS.enc.Base64.parse('u/Gu5posvwDsXUnV5Zaq4g==');
  var iv = CryptoJS.lib.WordArray.random(16)

  var ciphertext = CryptoJS.AES.encrypt(text, key, {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
    iv: iv,
  });
  return iv + ":" + ciphertext.toString()
}
exports.decryptAES = function (encrypted) {

  var key = CryptoJS.enc.Base64.parse('u/Gu5posvwDsXUnV5Zaq4g==');
  var encryptedArray = encrypted.split(":");
  var iv = CryptoJS.enc.Hex.parse(encryptedArray[0])
  var bytes = CryptoJS.AES.decrypt(encryptedArray[1], key, {
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
    iv: iv
  });

  return bytes.toString(CryptoJS.enc.Utf8);
}


const NodeRSA = require('node-rsa');
var key = new NodeRSA({
  b: 512
});

exports.getKey = function () {
  key = new NodeRSA({
    b: 512
  });
  return {
    privete: key.exportKey('pkcs1-private-pem'),
    public: key.exportKey('pkcs1-public-pem')
  }
}

exports.encrypt = function (publicKey, text) {
  return new NodeRSA(publicKey, "pkcs1-public", {
    encryptionScheme: "pkcs1"
  }).encrypt(text, 'base64');
}

exports.decrypt = function (privateKey, text) {
  return new NodeRSA(privateKey, "pkcs1-private", {
    encryptionScheme: "pkcs1"
  }).decrypt(text, 'utf8');
}