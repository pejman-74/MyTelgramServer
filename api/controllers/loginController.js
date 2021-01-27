'use strict';

require('dotenv').config();

const {
    JWT
} = require('jose')
var userDAO = require('../dao/userDAO');
const {
    ExternalError
} = require('../utils/customErrors');



exports.loginTokenIsValid = async function (phone_number, token) {

    var phoneNumber = phone_number
    var userToken = token

    var user = await userDAO.findUserByPhoneNumber(phoneNumber)

    if (user.last_sms_login_token === userToken && (user.status === "active" || !user.status)) {

        let payload = {
            id: user._id,
            lst: user.last_sms_login_token,
        }

        let token = JWT.sign(payload, process.env.SECRET_JWT_KEY, {
            algorithm: 'HS256'
        })
        await userDAO.addAuthToken(user._id, token)

        return await userDAO.findOneMainUser(user._id, true)
    }

    if (user.last_sms_login_token === userToken && user.status === "deactive")
        throw (new ExternalError('Sorry your accunt is deactivated!'))

    if (user.last_sms_login_token !== userToken)
        throw (new ExternalError('Code is invalid!'))

    throw (new ExternalError('There was a problem!'))
}

exports.sendLoginVerifySMS = async function (phone_number, country_code, country_name = null) {

    var generatedToken = generatToken()
    var phoneNumber = phone_number.replace(/ /g, '')
    console.log(generatedToken)

    return await userDAO.upsertUser(phoneNumber, {
        last_sms_login_token: generatedToken,
        country_name: country_name,
        country_code: country_code,
    })


}

function generatToken(length = 5) {

    if (length < 1)
        throw new RangeError('Length must be at least 1')

    let string = ''
    for (let i = 0; i < length; i++) {
        let random = Math.floor(Math.random() * (9 - 1 + 1)) + 1
        string += random.toString()
    }
    return string
}