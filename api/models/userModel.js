'use strict';
const mongoose = require('mongoose');
var Schema = mongoose.Schema;


var userSchema = new Schema({

  uuid: {
    type: String,
    default: ""
  },
  phone_number: {
    type: String,
    default: ""
  },
  country_name: {
    type: String,
    default: ""
  },
  user_name: {
    type: String,
    default: ""
  },
  profile_url: {
    type: String,
    default: ""
  },
  country_code: {
    type: String,
    default: ""
  },
  last_sms_login_token: {
    type: String,
    default: ""
  },
  last_auth_token: {
    type: String,
    default: ""
  },
  pri_key: {
    type: String,
    required: 'Losted privet key',
    unique: true
  },
  pub_key: {
    type: String,
    required: 'Losted public key',
    unique: true
  },
  status: {
    type: String,
    enum: ['active', 'deactive'],
    default: 'active'

  },
  deleted: {
    type: Schema.Types.Boolean
  },
  lastSeen: {
    type: Schema.Types.Date
  },
  isOnline:{
    type:Schema.Types.Boolean
  },

  lastAction: {
    type: Schema.Types.String
  }

}, {
  strict: false,
  timestamps: true
});

var personMessageSchema = new Schema({
  messageOwner: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  receiverUser: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  text: {
    type: String
  },
  userCreateTime: {
    type: Date
  },
  deleted: {
    type: Schema.Types.Boolean
  }

}, {
  strict: false,
  timestamps: true
});

var roomSchema = new Schema({
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  count_members: {
    type: Schema.Types.Number
  },
  avatar_url: {
    type: String,
    default: ""
  },
  name: {
    type: String,
    default: ""
  },
  deleted: {
    type: Schema.Types.Boolean
  }
}, {
  strict: false,
  timestamps: true
});

var roomMessageSchema = new Schema({
  roomOwner: {
    type: Schema.Types.ObjectId,
    ref: 'Room'
  },
  messageOwner: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  text: {
    type: String
  },
  userCreateTime: {
    type: Date
  },
  deleted: {
    type: Schema.Types.Boolean
  }
}, {
  strict: false,
  timestamps: true
});


const User = mongoose.model('User', userSchema);
const Room = mongoose.model('Room', roomSchema);
const roomMessage = mongoose.model('roomMessage', roomMessageSchema);
const personMessage = mongoose.model('personMessage', personMessageSchema);

module.exports = {
  User,
  personMessage,
  roomMessage,
  Room
}