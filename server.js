const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const connectDB = require('./Config/db');
// routes imports
const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/roleRoutes');
const courseRoutes = require('./routes/courseRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const courseOnlyRoutes = require('./routes/courseOnlyRoutes');
const chapterRoutes = require('./routes/chapterRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const userRoutes = require('./routes/userRoutes');
const assignmentRoutes = require('./routes/assignmentRoutes');
const assignmentSubmitRoutes = require('./routes/assignmentSubmissionRoutes');
const commonRoutes = require('./routes/commonRoutes');
const permissionRoutes = require('./routes/permissionRoutes');
const studentRoutes = require('./routes/studentRoutes');
const tutorRoutes = require('./routes/tutorRoutes');
const questionRoutes = require('./routes/questionAnswerRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const swaggerDocs = require('./docs/swagger');
const cors = require('cors');
const clc = require('cli-color');
const morgan = require('morgan');
const errorHandler = require('./middleware/errorHandler');
const updateExpiredAssignments = require('./cron/updateExpiredAssignments');
connectDB();

const app = express();

app.use(cors({origin: ["http://localhost:3000","https://lucent-tapioca-4ef19f.netlify.app"], 
    credentials: true, }));
// Increase limit to 50mb or more, as needed
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static('uploads'));
app.use(morgan("dev"));
updateExpiredAssignments();

app.use('/api/V1/auth', authRoutes);
app.use('/api/V1/roles',roleRoutes);
app.use('/api/V1/permissions',permissionRoutes);
app.use('/api/V1/modules', moduleRoutes);
app.use('/api/V1/courses',courseOnlyRoutes);
app.use('/api/V1/chapters',chapterRoutes);
app.use('/api/V1/lessons',lessonRoutes);
app.use('/api/V1/users',userRoutes);
app.use('/api/V1/tutors',tutorRoutes);
app.use('/api/V1/assignments',assignmentRoutes);
app.use('/api/V1/assignment-submissions',assignmentSubmitRoutes);
app.use('/api/V1/common',commonRoutes);
app.use('/api/V1/questions',questionRoutes); 
app.use('/api/V1/students',studentRoutes);
app.use('/api/V1/attendance',attendanceRoutes);
app.use('/api/V1/notifications',notificationRoutes)
// app.use('/api/V1/courses',courseRoutes);

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
