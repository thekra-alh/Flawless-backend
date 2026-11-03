const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

const upload = require("../middleware/upload.middleware");
const authenticateToken = require("../middleware/auth.middleware");
const db = require("../config/db");
const { analyzeImage } = require("../services/analysis.service");
const { generateRecommendations } = require("../services/recommendation.service");

const router = express.Router();

const uploadsDir = path.join(__dirname, "..", "uploads");

router.post("/analyze", authenticateToken, (req, res) => {
    upload.single("image")(req, res, async (uploadError) => {
        if (uploadError) {
            return res.status(400).json({ success: false, message: uploadError.message });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "Please upload an image." });
        }

        let survey = {};

        try {
            if (req.body && req.body.survey) {
                survey = typeof req.body.survey === "string"
                    ? JSON.parse(req.body.survey)
                    : req.body.survey;
                if (!survey || typeof survey !== "object" || Array.isArray(survey)) {
                    throw new Error("Invalid survey");
                }
            }
        } catch (e) {
            return res.status(400).json({ success: false, message: "Survey must contain valid JSON." });
        }

        let connection;
        let savedImagePath;

        try {
            const userId = Number(req.user.userId);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(401).json({ success: false, message: "Invalid authenticated user." });
            }

            const analysisResult = await analyzeImage(req.file.buffer);
            const recommendations = generateRecommendations(analysisResult);

            await fs.mkdir(uploadsDir, { recursive: true });

            const extension = req.file.mimetype === "image/png" ? ".png" : ".jpg";
            const filename = Date.now() + "-" + crypto.randomUUID() + extension;
            savedImagePath = path.join(uploadsDir, filename);

            await fs.writeFile(savedImagePath, req.file.buffer);

            connection = await db.getConnection();
            await connection.beginTransaction();

            const [users] = await connection.execute(
                "SELECT user_id FROM User WHERE user_id = ?",
                [userId]
            );

            if (users.length === 0) {
                throw new Error("Authenticated user was not found in the database.");
            }

            const answers = Array.isArray(survey.answers) ? survey.answers : [];

            const answerText = function(index, options) {
                const value = answers[index];
                if (value === null || value === undefined) return null;
                return options[value] !== undefined ? options[value] : null;
            };

            const [surveyInsert] = await connection.execute(
                "INSERT INTO SkinSurvey (user_id, skin_concern, water_intake, sunscreen_usage, sleep_quality) VALUES (?, ?, ?, ?, ?)",
                [
                    userId,
                    answerText(2, ["Acne & breakouts", "Dark spots & uneven tone", "Fine lines & aging", "Dryness & dehydration"]),
                    null,
                    answerText(3, ["Yes, every day", "Only when outdoors", "Rarely", "Never"]),
                    answerText(1, ["Always", "Sometimes", "Rarely", "Never"])
                ]
            );

            const relativeImagePath = "uploads/" + filename;

            const [imageInsert] = await connection.execute(
                "INSERT INTO FacialImage (user_id, image_path, validation_status) VALUES (?, ?, ?)",
                [userId, relativeImagePath, "valid"]
            );

            const [analysisInsert] = await connection.execute("INSERT INTO AnalysisResult (user_id, image_id, survey_id, skin_type, acne_severity, skin_score) VALUES (?, ?, ?, ?, ?, ?)",
                [userId, imageInsert.insertId, surveyInsert.insertId, null, analysisResult.acneLevel || null, null]
            );

            const morning = recommendations.filter(function(i) { return i.routine && i.routine.toLowerCase() === "morning"; }).map(function(i) { return i.recommendation; }).join("\n");
            const night = recommendations.filter(function(i) { return i.routine && i.routine.toLowerCase() === "night"; }).map(function(i) { return i.recommendation; }).join("\n");
            const ingredients = recommendations.filter(function(i) { return i.category === "ingredient"; }).map(function(i) { return i.recommendation; }).join("\n");
            const warnings = recommendations.filter(function(i) { return i.category === "warning"; }).map(function(i) { return i.recommendation; }).join("\n");

            await connection.execute(
                "INSERT INTO Recommendation (analysis_id, morning_routine, night_routine, ingredients, warnings) VALUES (?, ?, ?, ?, ?)",
                [analysisInsert.insertId, morningrt] = await connectnull, ingredientsequire("express");
connull]
            );

            await connection.execute(
                "INSERT INTO History (user_id, analysis_id) VALUES (?, ?)",
                [userId, analysisInsert.insertId]
            );

            await connection.commit();

            return res.status(200).json({
                success: true,
                analysisId: analysisInsert.insertId,
                status: "completed",
                surveyReceived: survey,
                analysisResult: analysisResult,
                recommendations: recommendations
            });
        } catch (error) {
            if (connection) { await connection.rollback().catch(function() {}); }
            if (savedImagePath) { await fs.unlink(savedImagePath).catch(function() {}); }
            console.error("Analysis/database error:", error);
            return res.status(500).json({ success: false, status: "failed", message: "Image analysis or database saving failed." });
        } finally {
            if (connection) connection.release();
        }
    });
});

module.exports = router;