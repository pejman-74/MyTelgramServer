'use strict';
const express = require('express'),
    app = express(),
    http = require('http'),
    port = process.env.PORT || 3000,
    mongoose = require('mongoose'),
    userModel = require('./api/models/userModel'),
    Timestamp = require('mongodb').Timestamp,
    userDAO = require('./api/dao/userDAO'),
    loginController = require('./api/controllers/loginController'),
    customErrors = require('./api/utils/customErrors'),
    fs = require('fs'),
    sharp = require('sharp');

var opLogCollection;
require('dotenv').config()

mongoose.Promise = global.Promise
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);
mongoose.connect('mongodb://localhost/MyTelegram?replicaSet=rs0')


mongoose.createConnection('mongodb://localhost/local?replicaSet=rs0').then(conn => {
    opLogCollection = conn.collection('oplog.rs')
})


const server = http.Server(app)


const authOptions = {
    path: '/sockets/auth',
    serveClient: false,
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false,
    methods: ["GET", "POST"],
    credentials: true,
    cors: true
}
const authIo = require('socket.io')(server, authOptions)
authIo.use(require('./api/middleware/beforeLoginAuth'))


authIo.on('connection', async (socket) => {
    console.log("---one user connect to auth server---");
    socket.on('disconnect', async () => {

        console.log("---one user disconnected from auth server---");
    })

    socket.on("verifySmsDetection", async (phoneNumber, countryCode, callback) => {
        console.log("verifySmsDetection")
        if (!phoneNumber || !countryCode || phoneNumber.length < 6) {
            callback("failed")
            return
        }
        try {
            await loginController.sendLoginVerifySMS(phoneNumber, countryCode)
            callback("ok")
        } catch (error) {
            callback("failed")
        }
    })

    socket.on("tokenValidationDetection", async (phoneNumber, token, callback) => {
        console.log("tokenValidationDetection")
        if (!token || token.length != 5 || !phoneNumber) {
            callback("failed")
            return
        }
        try {
            let mainUser = await loginController.loginTokenIsValid(phoneNumber, token)
            callback(mainUser)
            socket.disconnect(true)
        } catch (error) {
            console.log(error)
            if (error instanceof customErrors.ExternalError)
                callback(error.message)
            else
                callback("failed")
        }
    })

})



/////AFTER LOGIN CONFIGS
const userOption = {
    path: '/sockets/user',
    serveClient: false,
    // below are engine.IO options
    pingInterval: 10000,
    pingTimeout: 5000,
    cookie: false,
    methods: ["GET", "POST"],
    credentials: true,
    cors: true
}
const userIo = require('socket.io')(server, userOption)
userIo.use(require('./api/middleware/authUser'))

const sessionsMap = {}

userIo.on('connection', async (socket) => {
    let mainUser = socket.user
    sessionsMap[mainUser._id] = socket.id
    await userDAO.upadateUserIsOnline(mainUser._id, true)
    let socketCusers = userDAO.getIdFromKeys(mainUser, "C_")
    let socketRooms = userDAO.getIdFromKeys(mainUser, "R_")
    console.log('user ' + mainUser._id + ' connected');
    socketCusers.forEach(async userId => {
        if (userId in sessionsMap) {
            //send to "conversionUsers" hey this user came online.
            userIo.to(sessionsMap[userId]).emit('userOffOn', mainUser._id, "on")
            //send to self-user other "conversionUsers" status.
            userIo.to(socket.id).emit('userOffOn', userId, "on")
        } else {
            let filterdUser = await userDAO.findOneUser(userId, true)
            userIo.to(socket.id).emit('userOffOn', mainUser._id, filterdUser.lastSeen)
        }
    })

    socket.on("userUpdateRequestDetection", async (callback) => {
        console.log("userUpdateRequestDetection")

        if (mainUser.lastAction === "logined") {

            socketCusers.forEach(async (cUserId) => {
                let filterdUser = await userDAO.findOneUser(cUserId, true)
                userIo.to(socket.id).emit('conversationUserInsertOrUpdate', filterdUser)
                let relatedPMessages = await userDAO.getPersonMessages(mainUser._id, cUserId)
                relatedPMessages.forEach(pMessage => {
                    userIo.to(socket.id).emit('personMessageInsertOrUpdate', pMessage)
                })
            })

            socketRooms.forEach(async (roomId) => {
                let roomWithmembersAndMessages = await userDAO.getRoomWithMembersAndMessages(roomId)
                userIo.to(socket.id).emit('roomInsertOrUpdate', roomWithmembersAndMessages)
            })


        } else {
            let seconds = parseInt(new Date(mainUser.lastSeen).getTime() / 1000)
            let startAtOperationTime = new Timestamp(1, seconds);

            let changeCount = await opLogCollection.find({
                ns: "MyTelegram.users",
                op: "u",
                "o2._id": mainUser._id,
                ts: {
                    $gt: startAtOperationTime
                }
            }).count()

            let filteredMainUser = await userDAO.findOneMainUser(mainUser._id, true)

            userIo.to(socket.id).emit('mainUserInsertOrUpdate', filteredMainUser)

            let filter = [{
                $match: {
                    operationType: "update",
                    "documentKey._id": mongoose.Types.ObjectId(mainUser._id)
                }
            }];
            let userChangeStream = userModel.User.collection.watch(filter, {
                startAtOperationTime: startAtOperationTime,
            }).stream()

            for (let index = 1; index <= changeCount; index++) {

                let change = await userChangeStream.next()

                //handle rooms 
                let addedRooms = userDAO.getIdFromKeys(change.updateDescription.updatedFields, "R_")
                let deletedRooms = userDAO.getIdFromKeys(change.updateDescription.removedFields, "R_")

                //send deleted rooms
                deletedRooms.forEach(dRoom => {
                    console.log(dRoom + " room deleted")
                    userIo.to(socket.id).emit('roomDelete', dRoom)
                })

                //send new rooms
                for (let nRoom of addedRooms) {
                    let filterdRoom = await userDAO.findOneRoom(nRoom, true)
                    userIo.to(socket.id).emit('roomInsertOrUpdate', filterdRoom)
                    console.log(nRoom + " room added")
                }

                //handle conversationUser
                let addedCuser = userDAO.getIdFromKeys(change.updateDescription.updatedFields, "C_")
                let deletedCuser = userDAO.getIdFromKeys(change.updateDescription.removedFields, "C_")

                //send deleted conversationUser
                deletedCuser.forEach(pCUser => {
                    console.log(pCUser + " conversationUser deleted")
                    userIo.to(socket.id).emit('conversationUserDelete', pCUser)
                })

                //send new conversationUser
                for (let nCuser of addedCuser) {
                    let filterdUser = await userDAO.findOneUser(nCuser, true)
                    userIo.to(socket.id).emit('conversationUserInsertOrUpdate', filterdUser)
                    console.log(nCuser + " conversationUsers added")
                }

            }

            console.log("resumed to  pMChangeStream");
            await userChangeStream.close()

            filter = [{
                $match: {
                    operationType: {
                        $in: ["update", "insert", "replace"]
                    },
                    $or: [{
                        "fullDocument.messageOwner": mongoose.Types.ObjectId(mainUser._id)
                    }, {
                        "fullDocument.receiverUser": mongoose.Types.ObjectId(mainUser._id)
                    }]

                }
            }]

            //handle new or updated person messages
            let pMChangeStream = userModel.personMessage.watch(filter, {
                fullDocument: "updateLookup",
                startAtOperationTime: startAtOperationTime
            })
            pMChangeStream.on('change', change => {

                let data, event
                if (change.fullDocument['deleted'] == true) {
                    data = change.fullDocument._id
                    event = 'personMessageDelete'
                } else {
                    data = change.fullDocument
                    delete data['deleted']
                    delete data['updatedAt']
                    delete data['__v']
                    event = 'personMessageInsertOrUpdate'
                }
                userIo.to(socket.id).emit(event, data)
            })

            closeChangeStream(10000, pMChangeStream)


            for await (let roomId of socketRooms) {
                //send last version of current user rooms
                let filterdRoom = await userDAO.findOneRoom(roomId, true)
                userIo.to(socket.id).emit('roomInsertOrUpdate', filterdRoom)

                changeCount = await opLogCollection.find({
                    ns: "MyTelegram.rooms",
                    op: "u",
                    "o2._id": mongoose.Types.ObjectId(roomId),
                    ts: {
                        $gt: startAtOperationTime
                    }
                }).count()

                //send last version of user rooms 
                filter = [{
                    $match: {
                        operationType: "update",
                        "documentKey._id": mongoose.Types.ObjectId(roomId)
                    }
                }];

                let rChangeStream = userModel.Room.collection.watch(filter, {
                    startAtOperationTime: startAtOperationTime
                })

                for (let index = 1; index <= changeCount; index++) {

                    let change = await rChangeStream.next();

                    let memberChanges = await roomMemberChangeStremCalculator(change.updateDescription)
                    //send deleted admins
                    memberChanges.removedAdmins.forEach(dAdmins => {
                        console.log(dAdmins + " roomAdmin deleted")
                        userIo.to(sessionsMap[mainUser._id]).emit('roomUserDelete', roomId, dAdmins, "admin")
                    })

                    //send new admins
                    for (let nAdmin of memberChanges.addedAdmins) {
                        let filterdUser = await userDAO.findOneUser(nAdmin, true)
                        userIo.to(sessionsMap[mainUser._id]).emit('roomUserInsertOrUpdate', roomId, filterdUser, "admin")
                        console.log(nAdmin + " roomAdmin added")
                    }

                    //send deleted members
                    memberChanges.removedMembers.forEach(dMember => {
                        console.log(dMember + " roomMember deleted")
                        userIo.to(sessionsMap[mainUser._id]).emit('roomUserDelete', roomId, dMember, "member")
                    })

                    //send new members
                    for (let nMember of memberChanges.addedMembers) {
                        let filterdUser = await userDAO.findOneUser(nMember, true)
                        userIo.to(sessionsMap[mainUser._id]).emit('roomUserInsertOrUpdate', roomId, filterdUser, "member")
                        console.log(nMember + " roomMember added")
                    }


                }

                await rChangeStream.close()
                console.log("resume to rMChangeStream");
                //handle new or updated roomMessages
                filter = [{
                    $match: {
                        operationType: {
                            $in: ["update", "insert", "replace"]
                        },
                        "fullDocument.roomOwner": mongoose.Types.ObjectId(roomId)
                    }
                }];
                let rMChangeStream = userModel.roomMessage.collection.watch(filter, {
                    fullDocument: "updateLookup",
                    startAtOperationTime: startAtOperationTime
                })
                rMChangeStream.on("change", (change) => {

                    let data, event
                    if (change.fullDocument['deleted'] == true) {
                        data = change.fullDocument._id
                        event = 'roomMessageDelete'
                    } else {
                        data = change.fullDocument
                        delete data['deleted']
                        delete data['updatedAt']
                        delete data['__v']
                        event = 'roomMessageInsertOrUpdate'
                    }
                    userIo.to(socket.id).emit(event, data)
                })

                closeChangeStream(10000, rMChangeStream)
            }

        }
        if (mainUser._id in sessionsMap)
            await userDAO.upadateUserLastSeenAndLastAction(mainUser._id, "gotFeed")

        callback("ok")

    })

    socket.on('imageRequest', async (imageName, type, callback) => {
        //check this 
        var dir = './profileImages/'
        let avatarPath = dir + imageName + ".jpg"
        try {
            let imageString
            if (type == "large") {
                imageString = fs.readFileSync(avatarPath, "base64")
            } else if (type == "small") {
                imageString = (await sharp(avatarPath).resize(128, 128).toBuffer()).toString('base64')
            }
            callback(imageString)
        } catch (error) {
            callback("failed")
            console.log(error)
        }

    })

    socket.on('logOutDetection', async (callback) => {
        console.log("logOutDetection")
        try {
            await userDAO.removeAuthToken(mainUser._id)
            callback("ok")
        } catch (error) {
            callback("failed")
            console.log(error)
        }
        socket.disconnect(true)
    })


    socket.on('searchDetection', async (text, type, callback) => {
        console.log("searchDetection")
        try {
            let searchResult
            switch (type) {
                case "user":
                    searchResult = await userDAO.searchInUsers(mainUser._id, text)
                    break;
                case "room":
                    searchResult = await userDAO.searchInRooms(text)
                    break;
                case "roomAndUser":
                    searchResult = await userDAO.searchInRoomsAndUsers(mainUser._id, text)
                    break;
                default:
                    searchResult = "failed"
                    break;
            }
            callback(searchResult)
        } catch (error) {
            callback("failed")
            console.log(error)
        }

    })
    socket.on('deleteConversationUserDetection', async (conversationUserId, callback) => {
        console.log("deleteConversationUserDetection")
        try {
            await userDAO.deleteconversationUserWithMessages(mainUser._id, conversationUserId)
            userIo.to(sessionsMap[conversationUserId]).emit('conversationUserDelete', socket.user._id)
            callback("ok")
        } catch (error) {
            callback("failed")
            console.log(error)
        }

    })

    socket.on('newPersonMessageDetection', async (receiverId, messageContent, userCreateTime, callback) => {
        console.log("newPersonMessageDetection")
        try {
            let isFriestMessage = await userDAO.sentPersonMessage(socket.user._id, receiverId, messageContent, userCreateTime)
            if (isFriestMessage) {
                console.log("conversationUserInsertOrUpdate")
                let conversationUser = await userDAO.findOneUser(socket.user._id, true)
                userIo.to(sessionsMap[receiverId]).emit('conversationUserInsertOrUpdate', conversationUser)
            }
            callback("ok")

        } catch (error) {
            callback("failed")
            console.log(error)
        }

    })

    socket.on('deletePersonMessageDetection', async (messageId, callback) => {
        console.log("deletePersonMessageDetection")
        try {
            await userDAO.deletePersonMessage(messageId)
            callback("ok")
        } catch (error) {
            callback("failed")
            console.log(error)
        }

    })
    socket.on('newRoomMessageDetection', async (roomId, messageContent, userCreateTime, callback) => {
        console.log("newRoomMessageDetection")
        try {
            await userDAO.sentRoomMessage(socket.user._id, roomId, messageContent, userCreateTime)
            callback("ok")
        } catch (error) {
            callback("failed")
        }

    })
    socket.on('newRoomDetection', async (name, avatarImgData, members, callback) => {
        console.log("newRoomDetection")
        try {
            await userDAO.createRoom(socket.user._id, name, avatarImgData, members)
            callback("ok")
        } catch (error) {
            console.log(error);
            callback("failed")
        }

    })
    socket.on('joinToRoomDetection', async (roomId, callback) => {
        console.log("joinToRoomDetection")
        try {
            await userDAO.joinUserToRoom(socket.user._id, roomId)
            let roomWithmembersAndMessages = await userDAO.getRoomWithMembersAndMessages(roomId)
            callback(roomWithmembersAndMessages)
        } catch (error) {
            console.log(error);
            callback("failed")
        }
        //jointo room is make
    })
    socket.on('deleteRoomDetection', async (roomId, callback) => {
        console.log("deleteRoomDetection " +roomId)
        let deleteRoom = await userModel.Room.findById(roomId)
        if (deleteRoom.owner.toString() == socket.user._id) {
            try {
                await userDAO.deleteRoom(roomId)
                callback("ok")
            } catch (error) {
                console.log(error);
                callback("failed")
            }
        } else {
            try {
                await userDAO.deleteUserRoom(socket.user._id, roomId)
                callback("ok")
            } catch (error) {
                console.log(error);
                callback("failed")
            }
        }
    })

    socket.on('getRoomSampleMembersDetection', async (roomId, callback) => {
        console.log("getRoomSampleMembersDetection")
        try {
            let members = await userDAO.getRoomWithMembers(roomId, true)
            callback(members)
        } catch (error) {
            console.log(error);
            callback("failed")
        }

    })

    socket.on('deleteRoomMessageDetection', async (roomMessageId, callback) => {
        console.log("deleteRoomMessageDetection")
        try {
            await userDAO.deleteRoomMessage(roomMessageId)
            callback("ok")
        } catch (error) {
            console.log(error);
            callback("failed")
        }

    })

    socket.on('editMessageDetection', async (type, messageId, newText, callback) => {
        console.log("editMessageDetection")
        try {
            await userDAO.editMessage(type, messageId, newText)
            callback("ok")
        } catch (error) {
            console.log(error);
            callback("failed")
        }

    })

    socket.on('disconnect', async () => {
        console.log('user ' + socket.user._id + ' disconnected');
        await userDAO.upadateUserIsOnline(mainUser._id, false)
        let updatedUser = await userDAO.upadateUserLastSeenAndLastAction(socket.user._id, "disconnected")
        socketCusers.forEach(async cUser => {
            if (cUser in sessionsMap)
                userIo.to(sessionsMap[cUser]).emit('userOffOn', socket.user._id, updatedUser.lastSeen)
        })
        delete sessionsMap[socket.user._id]
    })

})

function closeChangeStream(timeInMs = 60000, changeStream) {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log("Closing the change stream");
            changeStream.close();
            resolve();
        }, timeInMs)
    })
}

async function roomMemberChangeStremCalculator(csUpdateDescription) {

    let addedAdmins = userDAO.getIdFromKeys(csUpdateDescription.updatedFields, "A_")
    let removedAdmins = userDAO.getIdFromKeys(csUpdateDescription.removedFields, "A_")
    let addedMembers = userDAO.getIdFromKeys(csUpdateDescription.updatedFields, "M_")
    let removedMembers = userDAO.getIdFromKeys(csUpdateDescription.removedFields, "M_")
    return {
        addedAdmins: addedAdmins,
        removedAdmins: removedAdmins,
        addedMembers: addedMembers,
        removedMembers: removedMembers
    }
}
async function sendDataToRoomMembers(room, event, ...data) {
    let roomMembersId = await userDAO.getRoomMembersId(room)
    userIo.to(sessionsMap[roomMembersId.owner]).emit(event, ...data)

    roomMembersId.admins.forEach(adminId => {
        userIo.to(sessionsMap[adminId]).emit(event, ...data)
    })

    roomMembersId.members.forEach(membersId => {
        userIo.to(sessionsMap[membersId]).emit(event, ...data)
    })

}
/* userModel.User.watch().on("change", c => {
    console.log(c);
}) */
const roomInsertEventEmitter = userModel.Room.watch([{
    $match: {
        operationType: {
            $in: ["update", "insert"]
        }
    }
}], {
    fullDocument: "updateLookup"
})

roomInsertEventEmitter.on('change', async (change) => {

    let roomId = change.documentKey._id

    if (change.operationType === "insert") {
        let roomWithMembers = await userDAO.getRoomWithMembers(roomId)
        await sendDataToRoomMembers(change.fullDocument, "roomInsertOrUpdate", roomWithMembers)
    }
    if (change.operationType === "update") {
        if (change.updateDescription.updatedFields.deleted == true) {
            await sendDataToRoomMembers(change.fullDocument, 'roomDelete', roomId)
        } else {
            let filteredRoom = await userDAO.findOneRoom(roomId, true)
            await sendDataToRoomMembers(change.fullDocument, 'roomInsertOrUpdate', filteredRoom)

            let memberChanges = await roomMemberChangeStremCalculator(change.updateDescription)

            for (let dAdmins of memberChanges.removedAdmins) {
                console.log(dAdmins + " roomAdmin deleted")
                await sendDataToRoomMembers(change.fullDocument, 'roomUserDelete', roomId, dAdmins, "admin")
            }

            for (let nAdmin of memberChanges.addedAdmins) {
                let filterdUser = await userDAO.findOneUser(nAdmin, true)
                console.log(nAdmin + " roomAdmin added")
                await sendDataToRoomMembers(change.fullDocument, 'roomUserInsertOrUpdate', roomId, filterdUser, "admin")
            }

            for (let dMember of memberChanges.removedMembers) {
                console.log(dMember + " roomMember deleted")
                await sendDataToRoomMembers(change.fullDocument, 'roomUserDelete', roomId, dMember, "member")
            }

            for (let nMember of memberChanges.addedMembers) {
                let filterdUser = await userDAO.findOneUser(nMember, true)
                console.log(nMember + " roomMember added")
                await sendDataToRoomMembers(change.fullDocument, 'roomUserInsertOrUpdate', roomId, filterdUser, "member")
            }

        }
    }


})


const roomMessageEventEmitter = userModel.roomMessage.watch([{
    $match: {
        operationType: {
            $in: ["update", "insert", "replace"]
        }
    }
}], {
    fullDocument: 'updateLookup'
})
roomMessageEventEmitter.on('change', async (change) => {

    let data, event
    if (change.fullDocument['deleted'] == true) {
        data = change.fullDocument._id
        event = 'roomMessageDelete'
    } else {
        data = change.fullDocument
        delete data['__v']
        delete data['updatedAt']
        event = 'roomMessageInsertOrUpdate'
    }

    let room = await userDAO.findOneRoom(change.fullDocument.roomOwner)
    await sendDataToRoomMembers(room, event, data)

})



const personMessageEventEmitter = userModel.personMessage.watch([{
    $match: {
        operationType: {
            $in: ["update", "insert", "replace"]
        }
    }
}], {
    fullDocument: 'updateLookup'
})
personMessageEventEmitter.on('change', async (change) => {

    let data, event
    if (change.fullDocument['deleted'] == true) {
        data = change.fullDocument._id
        event = 'personMessageDelete'
    } else {
        data = await userDAO.findOnePersonMessage(change.documentKey._id, true)
        event = 'personMessageInsertOrUpdate'
    }

    userIo.to(sessionsMap[change.fullDocument.messageOwner]).emit(event, data)
    userIo.to(sessionsMap[change.fullDocument.receiverUser]).emit(event, data)

})


server.listen(port)



console.log('MyTelegram server started on: ' + port)