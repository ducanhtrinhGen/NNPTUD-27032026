var express = require('express');
var router = express.Router();
let userController = require('../controllers/users')
let { RegisterValidator, handleResultValidator, ChangPasswordValidator } = require('../utils/validatorHandler')
let bcrypt = require('bcrypt')
let jwt = require('jsonwebtoken')
let { checkLogin } = require('../utils/authHandler')
let crypto = require('crypto')
let { sendMail } = require('../utils/senMailHandler')
let cartSchema = require('../schemas/carts')

/* GET home page. */
router.post('/register', RegisterValidator, handleResultValidator, async function (req, res, next) {
    let createdUser = null;
    let createdCart = null;
    try {
        let newUser = userController.CreateAnUser(
            req.body.username,
            req.body.password,
            req.body.email,
            "69aa8360450df994c1ce6c4c"
        );
        await newUser.save()
        createdUser = newUser;
        let newCart = new cartSchema({
            user: newUser._id
        })
        await newCart.save();
        createdCart = newCart;
        await newCart.populate('user')
        res.send({
            message: "dang ki thanh cong"
        })
    } catch (error) {
        if (createdCart) {
            await cartSchema.deleteOne({ _id: createdCart._id })
        }
        if (createdUser) {
            await createdUser.deleteOne()
        }
        res.status(404).send({
            message: error.message
        })
    }
});
router.post('/login', async function (req, res, next) {
    let { username, password } = req.body;
    let getUser = await userController.FindByUsername(username);
    if (!getUser) {
        res.status(403).send("tai khoan khong ton tai")
    } else {
        if (getUser.lockTime && getUser.lockTime > Date.now()) {
            res.status(403).send("tai khoan dang bi ban");
            return;
        }
        if (bcrypt.compareSync(password, getUser.password)) {
            await userController.SuccessLogin(getUser);
            let token = jwt.sign({
                id: getUser._id
            }, "secret", {
                expiresIn: '30d'
            })
            res.cookie('token_login_tungNT', token, {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                secure: false
            });
            res.send(token)
        } else {
            await userController.FailLogin(getUser);
            res.status(403).send("thong tin dang nhap khong dung")
        }
    }

});
router.get('/me', checkLogin, function (req, res, next) {
    res.send(req.user)
})
router.post("changepassword", checkLogin, ChangPasswordValidator, function (req, res, next) {
    let { oldpassword, newpassword } = req.body;
    let user = req.user;
    if (bcrypt.compareSync(oldpassword, user.password)) {
        user.password = newpassword;
        user.save();
    }
    res.send("da doi pass");
})
router.post("/logout", checkLogin, function (req, res, next) {
    res.cookie('token_login_tungNT', null, {
        maxAge: 0,
        httpOnly: true,
        secure: false
    })
    res.send("logout")
})
router.post('/forgotpassword', async function (req, res, next) {
    let email = req.body.email;
    let user = await userController.FindByEmail(email);
    if (user) {
        user.resetPasswordToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordTokenExp = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();
        let url = "http://localhost:3000/api/v1/auth/resetpassword/" + user.resetPasswordToken;
        await sendMail(user.email, url);
    }
    res.send("check mail de biet")
})
router.post('/resetpassword/:token', async function (req, res, next) {
    let { password } = req.body;
    let token = req.params.token;
    let user = await userController.FindByToken(token);
    if (!user) {
        res.status(404).send("token sai")
    } else {
        if (user.resetPasswordTokenExp > Date.now()) {
            user.password = password;
            user.resetPasswordToken = null;
            user.resetPasswordTokenExp = null;
            await user.save();
        }
    }
})


module.exports = router;
