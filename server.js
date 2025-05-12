const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("Connected to MongoDB Atlas"))
.catch(err => {
    console.error("MongoDB Connection Error:", err);
    process.exit(1);  // Exit on failure
});

// User Schema
const userSchema = new mongoose.Schema({
    username: String,
    password: String
});
const User = mongoose.model("User", userSchema);

// Book Schema
const bookSchema = new mongoose.Schema({
    title: String,
    author: String,
    coverImage: String,
    isRented: { type: Boolean, default: false }
});
const Book = mongoose.model("Book", bookSchema);

// Rental Schema
const rentalSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    bookId: mongoose.Schema.Types.ObjectId,
    rentedAt: { type: Date, default: Date.now }
});
const Rental = mongoose.model("Rental", rentalSchema);

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Authentication Middleware
const authenticate = async (req, res, next) => {    
    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });

    if (!token) return res.status(401).send("Access Denied");
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).send("Invalid Token");
    }
};

// User Registration
app.post("/register", async (req, res) => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);
    const user = new User({ username: req.body.username, password: hashedPassword });
    await user.save();
    res.send("User registered");
});

// User Login
app.post("/login", async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
        return res.status(400).send("Invalid credentials");
    }
    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);
    res.header("Authorization", token).send({ token });
});

// Add Book
app.post("/books", authenticate, upload.single("cover"), async (req, res) => {
    const book = new Book({ title: req.body.title, author: req.body.author, coverImage: req.file.path });
    await book.save();
    res.send(book);
});

// Get Books (with Pagination)
app.get("/books", authenticate, async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const books = await Book.find()
        .limit(limit * 1)
        .skip((page - 1) * limit);
    res.send(books);
});

// Rent a Book
app.post("/rent", authenticate, async (req, res) => {
    const book = await Book.findById(req.body.bookId);
    if (!book || book.isRented) return res.status(400).send("Book unavailable");
    const existingRental = await Rental.findOne({ userId: req.user._id });
    if (existingRental) return res.status(400).send("User already rented a book");
    
    book.isRented = true;
    await book.save();
    
    const rental = new Rental({ userId: req.user._id, bookId: book._id });
    await rental.save();
    res.send(rental);
});

// Return a Book
app.post("/return", authenticate, async (req, res) => {
    const rental = await Rental.findOne({ userId: req.user._id });
    if (!rental) return res.status(400).send("No rented book found");
    
    await Rental.deleteOne({ _id: rental._id });
    await Book.findByIdAndUpdate(rental.bookId, { isRented: false });
    
    res.send("Book returned");
});

// Start Server
app.listen(3000, () => console.log("Server running on port 3000"));
