const express = require("express");
const router = express.Router();
const { register, login,refreshToken ,me,logout} = require("../controllers/authController");
const verifyToken = require("./../middleware/verifyToken.js");
router.post("/register", register);
router.post("/login", login);
router.get("/refresh", refreshToken);
router.get("/me",verifyToken, me);
router.get("/logout", logout);




module.exports = router;
