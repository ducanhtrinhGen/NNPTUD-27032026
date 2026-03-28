const nodemailer = require("nodemailer");

const mailConfig = {
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    secure: false,
    auth: {
        user: "6b3559bedac6c1",
        pass: "bac4846bab7d69",
    },
};

const defaultFrom = "admin@hehehe.com";
const transporter = nodemailer.createTransport(mailConfig);

function ensureMailConfig() {
    if (!mailConfig.auth.user || !mailConfig.auth.pass) {
        throw new Error("Chua cau hinh Mailtrap. Vui long set MAILTRAP_USER va MAILTRAP_PASS");
    }
}

module.exports = {
    ensureMailConfig: ensureMailConfig,
    sendMail: async function (to,url) {
        ensureMailConfig();
        return await transporter.sendMail({
            from: defaultFrom,
            to: to,
            subject: "reset pass",
            text: "click vo day de doi pass", // Plain-text version of the message
            html: "click vo <a href="+url+">day</a> de doi pass", // HTML version of the message
        });
    },
    sendUserPasswordMail: async function (to, username, password) {
        ensureMailConfig();
        return await transporter.sendMail({
            from: defaultFrom,
            to: to,
            subject: "Tai khoan duoc tao - mat khau dang nhap",
            text: `Xin chao ${username},\n\nMat khau dang nhap (16 ky tu): ${password}\n\nVui long doi mat khau sau khi dang nhap.`,
            html: `<p>Xin chao ${username},</p><p>Mat khau dang nhap (16 ky tu): <strong>${password}</strong></p><p>Vui long doi mat khau sau khi dang nhap.</p>`,
        });
    }
}
