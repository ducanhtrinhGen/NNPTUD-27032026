var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/upload')
let path = require('path')
let exceljs = require('exceljs')
let crypto = require('crypto')
let categoryModel = require('../schemas/categories');
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let roleModel = require('../schemas/roles')
let userModel = require('../schemas/users')
let cartModel = require('../schemas/carts')
let userController = require('../controllers/users')
let { sendUserPasswordMail, ensureMailConfig } = require('../utils/senMailHandler')
let mongoose = require('mongoose')
let slugify = require('slugify')

function getCellValue(value) {
    if (value == null) {
        return "";
    }
    if (typeof value === 'object') {
        if (Array.isArray(value.richText)) {
            return value.richText.map(item => item.text).join('').trim();
        }
        if (typeof value.text === 'string') {
            return value.text.trim();
        }
        if (value.result != null) {
            return getCellValue(value.result);
        }
    }
    return String(value).trim();
}

function pickRandomChar(source) {
    return source[crypto.randomInt(0, source.length)];
}

function shuffleCharacters(chars) {
    for (let index = chars.length - 1; index > 0; index--) {
        let swapIndex = crypto.randomInt(0, index + 1);
        let temp = chars[index];
        chars[index] = chars[swapIndex];
        chars[swapIndex] = temp;
    }
    return chars.join('');
}

function generatePassword(length = 16) {
    let allCharacters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = [];
    while (password.length < length) {
        password.push(pickRandomChar(allCharacters));
    }
    return shuffleCharacters(password);
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9]+$/.test(username);
}

function isValidEmail(email) {
    return /^\S+@\S+\.\S+$/.test(email);
}

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, "../uploads", req.params.filename);
    res.sendFile(pathFile)
})
router.post('/excel/users', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    try {
        ensureMailConfig();
    } catch (error) {
        res.status(400).send({
            message: error.message
        })
        return
    }
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, "../uploads", req.file.filename);
    await workbook.xlsx.readFile(pathFile)
    let worksheet = workbook.worksheets[0];
    if (!worksheet) {
        res.status(400).send({
            message: "file excel khong co du lieu"
        })
        return
    }
    let headerMap = new Map();
    worksheet.getRow(1).eachCell((cell, colNumber) => {
        headerMap.set(getCellValue(cell.value).toLowerCase(), colNumber)
    })
    let usernameColumn = headerMap.get('username');
    let emailColumn = headerMap.get('email');
    if (!usernameColumn || !emailColumn) {
        res.status(400).send({
            message: "file excel phai co 2 cot username va email"
        })
        return
    }
    let userRole = await roleModel.findOne({
        name: /^user$/i,
        isDeleted: false
    })
    if (!userRole) {
        res.status(404).send({
            message: "khong tim thay role user"
        })
        return
    }
    let result = [];
    let usernamesInFile = new Set();
    let emailsInFile = new Set();
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let rowErrors = [];
        let cells = worksheet.getRow(row);
        let username = getCellValue(cells.getCell(usernameColumn).value);
        let email = getCellValue(cells.getCell(emailColumn).value).toLowerCase();
        if (!username && !email) {
            continue;
        }
        if (!username) {
            rowErrors.push('username khong duoc de trong')
        } else if (!isValidUsername(username)) {
            rowErrors.push('username khong duoc chua ki tu dac biet')
        }
        if (!email) {
            rowErrors.push('email khong duoc de trong')
        } else if (!isValidEmail(email)) {
            rowErrors.push('email sai dinh dang')
        }
        if (usernamesInFile.has(username.toLowerCase())) {
            rowErrors.push('username bi trung trong file')
        }
        if (emailsInFile.has(email)) {
            rowErrors.push('email bi trung trong file')
        }
        if (rowErrors.length === 0) {
            let existedUser = await userModel.findOne({
                isDeleted: false,
                $or: [
                    { username: username },
                    { email: email }
                ]
            });
            if (existedUser) {
                if (existedUser.username === username) {
                    rowErrors.push('username da ton tai')
                }
                if (existedUser.email === email) {
                    rowErrors.push('email da ton tai')
                }
            }
        }
        if (rowErrors.length > 0) {
            result.push({
                row: row,
                username: username,
                email: email,
                success: false,
                errors: rowErrors
            });
            continue;
        }
        usernamesInFile.add(username.toLowerCase());
        emailsInFile.add(email);
        let password = generatePassword(16);
        let createdUser = null;
        let createdCart = null;
        try {
            let newUser = userController.CreateAnUser(
                username,
                password,
                email,
                userRole._id
            );
            await newUser.save()
            createdUser = newUser;
            let newCart = new cartModel({
                user: newUser._id
            })
            await newCart.save()
            createdCart = newCart;
            await sendUserPasswordMail(email, username, password);
            result.push({
                row: row,
                username: username,
                email: email,
                success: true,
                message: "tao user va gui email thanh cong"
            });
        } catch (error) {
            if (createdCart) {
                await cartModel.deleteOne({ _id: createdCart._id })
            }
            if (createdUser) {
                await userModel.deleteOne({ _id: createdUser._id })
            }
            result.push({
                row: row,
                username: username,
                email: email,
                success: false,
                errors: [error.message]
            });
        }
    }
    res.send({
        message: "import user hoan tat",
        summary: {
            total: result.length,
            success: result.filter(item => item.success).length,
            failed: result.filter(item => !item.success).length
        },
        result: result
    })
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, "../uploads", req.file.filename);
    await workbook.xlsx.readFile(pathFile)
    let worksheet = workbook.worksheets[0];
    let result = [];
    let categories = await categoryModel.find({});
    let categoriesMap = new Map();
    for (const category of categories) {
        categoriesMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title);
    let getSku = products.map(p => p.sku)
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let rowErrors = [];
        const cells = worksheet.getRow(row);
        let sku = cells.getCell(1).value;
        let title = cells.getCell(2).value;
        let category = cells.getCell(3).value;//hop le
        let price = Number.parseInt(cells.getCell(4).value);
        let stock = Number.parseInt(cells.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            rowErrors.push("price phai so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            rowErrors.push("stock phai so duong")
        }
        if (!categoriesMap.has(category)) {
            rowErrors.push('category khong hop le')
        }
        if (getTitle.includes(title)) {
            rowErrors.push('title da ton tai')
        }
        if (getSku.includes(sku)) {
            rowErrors.push('sku da ton tai')
        }
        if (rowErrors.length > 0) {
            result.push(rowErrors);
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newObj = new productModel({
                sku:sku,
                title: title,
                slug: slugify(title, {
                    replacement: '-', lower: true, locale: 'vi',
                }),
                price: price,
                description: title,
                category: categoriesMap.get(category)
            })
            await newObj.save({ session })
            let newInventory = new inventoryModel({
                product: newObj._id,
                stock: stock
            })
            await newInventory.save({ session })
            await session.commitTransaction();
            await session.endSession()
            await newInventory.populate('product')
            getSku.push(sku);
            getTitle.push(title)
            result.push(newInventory);
        } catch (error) {
            await session.abortTransaction();
            await session.endSession()
            result.push(error.message);
        }
        //khong co loi
    }
    res.send(result)
})



module.exports = router;
