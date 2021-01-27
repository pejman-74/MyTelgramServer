'use strict';

var mongoose = require('mongoose'),
    userModel = mongoose.model('User'),
    roomModel = mongoose.model('Room'),
    personMessageModel = mongoose.model('personMessage'),
    roomMessageModel = mongoose.model('roomMessage'),
    encrypter = require('../utils/encryption'),
    {
        v4: uuidv4
    } = require('uuid');

const userFilterFields = "_id user_name profile_url lastSeen"
const mainUserFilterFields = "_id phone_number user_name profile_url last_auth_token"
const roomFilterFields = "_id name count_members avatar_url"
const roomMessageFilterFields = "-__v -updatedAt"
const personMessageFilterFields = "-__v -updatedAt "


exports.upsertUser = async function (phoneNumber, upsertUser) {

    var genKey = encrypter.getKey()
    return await userModel.findOneAndUpdate({
        phone_number: phoneNumber
    }, {
        $set: upsertUser,
        $setOnInsert: {
            user_name: "user" + phoneNumber.substr(phoneNumber.length - 4),
            uuid: uuidv4(),
            pri_key: genKey.privete,
            pub_key: genKey.public,
            lastSeen: new Date().toISOString(),
            lastAction: "neverLogined",
            isOnline: true
        }
    }, {
        new: true,
        upsert: true,
    })

}

exports.findOneUser = async function (userId, isFilterd = false) {
    if (isFilterd == true)
        return await userModel.findById(userId).select(userFilterFields).lean()

    return await userModel.findById(userId).lean()
}
exports.findUserByPhoneNumber = async function (phoneNumber) {
    return await userModel.findOne({
        phone_number: phoneNumber
    }).lean()
}
exports.findOneMainUser = async function (userId, isFilterd = false) {
    if (isFilterd == true)
        return await userModel.findById(userId).select(mainUserFilterFields).lean()

    return await userModel.findById(userId).lean()
}

exports.findOneRoom = async function (roomId, isFilterd = false) {
    if (isFilterd == true)
        return await roomModel.findById(roomId).select(roomFilterFields).lean()

    return await roomModel.findById(roomId).lean()
}
exports.findOneRoomMessage = async function (messageID, isFilterd = false) {
    if (isFilterd == true)
        return await roomMessageModel.findById(messageID).select(roomMessageFilterFields).lean()

    return await roomMessageModel.findById(messageID).lean()
}
exports.findOnePersonMessage = async function (messageID, isFilterd = false) {
    if (isFilterd == true)
        return await personMessageModel.findById(messageID).select(personMessageFilterFields).lean()

    return await personMessageModel.findById(messageID).lean()
}
exports.addCUserToUser = async function (mainUserId, userId) {
    return await userModel.updateOne({
        _id: mainUserId,
        [`C_${userId}`]: {
            $exists: false
        },
    }, {
        $set: {
            [`C_${userId}`]: undefined
        }

    })
}
exports.removeCuserFromUser = async function (mainUserId, userId) {
    return await userModel.updateOne({
        _id: mainUserId,
        [`C_${userId}`]: {
            $exists: true
        },
    }, {
        $unset: {
            [`C_${userId}`]: 1
        }

    })
}
exports.addRoomToUser = async function (mainUserId, roomId) {
    return await userModel.updateOne({
        _id: mainUserId,
        [`R_${roomId}`]: {
            $exists: false
        },
    }, {
        $set: {
            [`R_${roomId}`]: undefined
        }

    })
}
exports.removeRoomFromUser = async function (mainUserId, roomId) {
    return await userModel.updateOne({
        _id: mainUserId,
        [`R_${roomId}`]: {
            $exists: true
        },
    }, {
        $unset: {
            [`R_${roomId}`]: 1
        }

    })
}

exports.addAdminToRoom = async function (roomId, userId) {
    return await roomModel.updateOne({
        _id: roomId,
        [`A_${userId}`]: {
            $exists: false
        },
    }, {
        $set: {
            [`A_${userId}`]: undefined
        },
        $inc: {
            count_members: 1
        }
    })
}
exports.removeAdminFromRoom = async function (roomId, userId) {
    return await roomModel.updateOne({
        _id: roomId,
        [`A_${userId}`]: {
            $exists: true
        },
    }, {
        $unset: {
            [`A_${userId}`]: 1
        },
        $inc: {
            count_members: -1
        }
    })
}

exports.addMemberToRoom = async function (roomId, userId) {
    return await roomModel.updateOne({
        _id: roomId,
        [`M_${userId}`]: {
            $exists: false
        },
    }, {
        $set: {
            [`M_${userId}`]: undefined
        },
        $inc: {
            count_members: 1
        }

    })
}
exports.removeMemberFromRoom = async function (roomId, userId) {
    return await roomModel.updateOne({
        _id: roomId,
        [`M_${userId}`]: {
            $exists: true
        },
    }, {
        $unset: {
            [`M_${userId}`]: 1
        },
        $inc: {
            count_members: -1
        }
    })
}
exports.upadateUserLastSeenAndLastAction = async function (userId, action) {
    return await userModel.findByIdAndUpdate(userId, {
        lastSeen: Date.now(),
        lastAction: action
    })
}
exports.upadateUserIsOnline = async function (userId, online) {
    return await userModel.findByIdAndUpdate(userId, {
        isOnline: online
    })
}
exports.verifyAuthToken = async function (authToken) {
    if (authToken.trim().length == 0)
        return false

    return await userModel.findOne({
        last_auth_token: authToken
    }).lean()
}

exports.removeAuthToken = async function (userId) {

    return await userModel.findByIdAndUpdate(userId, {
        last_auth_token: ""
    })

}
exports.addAuthToken = async function (userId, token) {
    await userModel.findByIdAndUpdate(userId, {
        last_auth_token: token,
        lastAction: "logined"
    })
}
exports.createRoom = async function (creatorId, name, avatarImgData, members) {
    let avatarName = ""
    if (avatarImgData.length != 0) {
        var fs = require('fs');
        var dir = './profileImages/';
        avatarName = uuidv4()
        let newAvatarPath = dir + avatarName + ".jpg"
        try {
            fs.writeFileSync(newAvatarPath, avatarImgData, 'base64')
        } catch (error) {
            avatarName = ""
            throw (error)
        }
    }
    if (name.length < 1)
        throw ("Group name can't empty")
    let membersArray = JSON.parse(members)
    if (membersArray.length < 1)
        throw ("Group member can't empty")

    let roomElementObject = {
        owner: creatorId,
        name: name,
        avatar_url: avatarName,
        count_members: membersArray.length + 1
    }
    for (let meberId of membersArray) {
        roomElementObject[`M_${meberId}`] = null
        console.log(roomElementObject);
    }

    let createdRoom = await roomModel.create(roomElementObject)

    exports.addRoomToUser(creatorId, createdRoom._id)
    membersArray.forEach(async (meberId) => {
        exports.addRoomToUser(meberId, createdRoom._id)
    })
}


exports.deleteRoom = async function (roomId) {

    let deleteRoom = await exports.findOneRoom(roomId)
    
    if (deleteRoom == null)
        throw "deleteRoom = cannot find Room"

    await exports.removeRoomFromUser(deleteRoom.owner, roomId)

    let roomMembersId = await exports.getRoomMembersId(deleteRoom)
    roomMembersId.members.forEach(async (membersId) => {
        await exports.removeRoomFromUser(membersId, roomId)
    })

    roomMembersId.admins.forEach(async (adminId) => {
        await exports.removeRoomFromUser(adminId, roomId)
    });

    await roomMessageModel.updateMany({
        roomOwner: roomId
    }, {
        deleted: true
    })

    await roomModel.findByIdAndUpdate(roomId, {
        deleted: true
    })

}
exports.deleteUserRoom = async function (userId, roomId) {
    exports.removeAdminFromRoom(roomId, userId)
    exports.removeMemberFromRoom(roomId, userId)
    exports.removeRoomFromUser(userId, roomId)
}


exports.joinUserToRoom = async function (userId, roomId) {
    await exports.addMemberToRoom(roomId, userId)
    await exports.addRoomToUser(userId, roomId)
}
exports.getRoomMembersId = async function (room) {
    let owner = room.owner
    let admins = exports.getIdFromKeys(room, "A_")
    let members = exports.getIdFromKeys(room, "M_")
    console.log("getRoomMembersId members=>"+members);
    return {
        owner: owner,
        admins: admins,
        members: members
    }
}
exports.getRoomWithMembers = async function (roomId, isSampleMode = false) {
    try {
        let room = await exports.findOneRoom(roomId)

        if (!room) {
            throw ("getRoomWithMembers = can't find room");
        }
        let roomMembers = await exports.getRoomMembersId(room)

        let owner = await exports.findOneUser(roomMembers.owner, true)
        let admins = []
        let members = []
        for await (let [index, aId] of roomMembers.admins.entries()) {
            admins.push(await exports.findOneUser(aId, true))
            if (isSampleMode && index == 5)
                break;
        }
        for await (let [index, mId] of roomMembers.members.entries()) {
            members.push(await exports.findOneUser(mId, true))
            if (isSampleMode && index == 5)
                break;
        }

        room.owner = owner
        room.admins = admins
        room.members = members
        return room
    } catch (error) {
        throw error
    }
}

exports.getRoomWithMembersAndMessages = async function (roomId) {
    let roomWithMembers = await exports.getRoomWithMembers(roomId)
    let roomMessages = await exports.getRoomMessages(roomId)
    roomWithMembers.messages = roomMessages
    return roomWithMembers
}


exports.deletePersonMessage = async function (messageId) {
    await personMessageModel.findByIdAndUpdate(messageId, {
        deleted: true
    })
    return true
}

exports.deleteconversationUserWithMessages = async function (userId, deleteconversationUserId) {
    await exports.removeCuserFromUser(userId, deleteconversationUserId)
    await exports.removeCuserFromUser(deleteconversationUserId, userId)

    await personMessageModel.updateMany({
        receiverUser: {
            $in: [userId, deleteconversationUserId]
        },
        messageOwner: {
            $in: [userId, deleteconversationUserId]
        }
    }, {
        deleted: true
    })

}

exports.sentPersonMessage = async function (userId, receiverId, messageText, _userCreateTime) {
    await exports.addCUserToUser(userId, receiverId)
    let receiverUser = await exports.addCUserToUser(receiverId, userId)

    await personMessageModel.create({
        messageOwner: userId,
        receiverUser: receiverId,
        text: messageText,
        userCreateTime: _userCreateTime
    })

    return receiverUser.nModified === 1
}

exports.sentRoomMessage = async function (userId, roomId, messageText, _userCreateTime) {
    await roomMessageModel.create({
        roomOwner: mongoose.Types.ObjectId(roomId),
        messageOwner: mongoose.Types.ObjectId(userId),
        text: messageText,
        userCreateTime: _userCreateTime
    })
}

exports.deleteRoomMessage = async function (messageId) {
    await roomMessageModel.findByIdAndUpdate(messageId, {
        deleted: true
    })
}

exports.editMessage = async function (type, messageId, newText) {

    if (!messageId && messageId === "")
        throw ("editMessage: messageId type is empty")
    if (!newText && newText === "")
        throw ("editMessage: newText type is empty")

    if (type === "p") {
        await personMessageModel.findByIdAndUpdate(messageId, {
            text: newText
        })
    } else if (type == "r") {
        await roomMessageModel.findByIdAndUpdate(messageId, {
            text: newText
        })
    } else {
        throw ("editMessage: message type must 'p' or 'r'")
    }
}

exports.getRoomMessagesByTime = async function (roomOwnerId, time) {
    return await roomMessageModel.find({
        roomOwner: roomOwnerId,
        createdAt: {
            $gte: time
        }
    }).select(roomMessageFilterFields).lean()
}


exports.getRoomMessages = async function (roomOwnerId) {
    return await roomMessageModel.find({
        roomOwner: roomOwnerId,
        $or: [{
            deleted: {
                $exists: false
            }
        }, {
            deleted: false
        }]
    }).select(roomMessageFilterFields)
}

exports.getPersonMessagesByTime = async function (ownerId, receiverId, time) {
    return await personMessageModel.find({
            receiverUser: {
                $in: [ownerId, receiverId]
            },
            messageOwner: {
                $in: [ownerId, receiverId]
            },
            createdAt: {
                $gte: time
            }
        }

    ).select(personMessageFilterFields).lean()
}

exports.getPersonMessages = async function (ownerId, receiverId) {

    return await personMessageModel.find({
        receiverUser: {
            $in: [ownerId, receiverId]
        },
        messageOwner: {
            $in: [ownerId, receiverId]
        },
        $or: [{
            deleted: {
                $exists: false
            }
        }, {
            deleted: false
        }]

    }).select(personMessageFilterFields).lean()

}

exports.searchInRoomsAndUsers = async function (userId, queryText) {

    let foundedUsers = await exports.searchInUsers(userId, queryText)
    let foundedRooms = await exports.searchInRooms(queryText)
    return {
        users: foundedUsers.users,
        rooms: foundedRooms.rooms
    }
}
exports.searchInRooms = async function (queryText) {

    let foundedRooms = await roomModel.find({
        name: new RegExp(queryText, "i"),
        $or: [{
            deleted: {
                $exists: false
            }
        }, {
            deleted: false
        }]
    }).select(roomFilterFields)
    return {
        rooms: foundedRooms
    }
}
exports.searchInUsers = async function (userId, queryText) {

    let foundedUsers = await userModel.aggregate([{
        $match: {
            user_name: new RegExp(queryText, "i"),
            _id: {
                $ne: mongoose.Types.ObjectId(userId)
            },
            $or: [{
                deleted: {
                    $exists: false
                }
            }, {
                deleted: false
            }]
        }
    }, {
        $project: {
            _id: 1,
            user_name: 1,
            profile_url: 1,
            lastSeen: {
                $cond: [{
                    $eq: ['$isOnline', true]
                }, 'on', '$lastSeen']
            }
        }
    }])
    return {
        users: foundedUsers
    }
}

exports.getIdFromKeys = function (object, regx) {
    if (!object)
        object = {}

    let regxObject = RegExp("^" + regx)
    let values = []
    if (Array.isArray(object))
        object.forEach((item, index) => {
            if (regxObject.test(item))
                values.push(String(object[index]).replace(regx, ""))
        })
    else {
        Object.keys(object).forEach(key => {
            if (regxObject.test(key)){
                values.push(String(key).replace(regx, ""))
                }
        })
    }
    return values
}