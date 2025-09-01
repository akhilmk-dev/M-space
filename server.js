const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./Config/db');
// routes imports
const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/roleRoutes');
const courseRoutes = require('./routes/courseRoutes');

const swaggerDocs = require('./docs/swagger');
const cors = require('cors');
const clc = require('cli-color');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');
dotenv.config();
connectDB();

const app = express();

app.use(cors());
// Increase limit to 50mb or more, as needed
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use(morgan("dev"));

app.use('/api/V1/auth', authRoutes);
app.use('/api/V1/roles',roleRoutes);
app.use('/api/V1/courses',courseRoutes);


// swagger documentation 
swaggerDocs(app);

// handle the error when none of the above routes works
app.use(errorHandler);



app.listen(process.env.PORT, () =>{
    console.log(clc.blueBright("────────────────────────────────────────────"));
    console.log(`${clc.green("🚀 Server Started Successfully")}`);
    console.log(`${clc.cyan("🌐 Environment")} : ${clc.whiteBright(process.env.NODE_ENV)}`);
    console.log(`${clc.cyan("📦 Host")}        : ${clc.whiteBright(process.env.HOST)}`);
    console.log(`${clc.cyan("📦 Port")}        : ${clc.whiteBright(process.env.PORT)}`);
    console.log(`${clc.cyan("🔗 Base URL")}    : ${clc.whiteBright(process.env.BASE_URL)}`);
    console.log(`${clc.cyan("📁 API URL")}     : ${clc.whiteBright(`${process.env.BASE_URL}${process.env.API_PREFIX}`)}`);
    console.log(clc.blueBright("────────────────────────────────────────────"));
});
