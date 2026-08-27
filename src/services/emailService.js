import 'dotenv/config';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendOtpEmail = async (email, otp) => {
  const mailOptions = {
    from: `"KhetiMaster" <${process.env.EMAIL_USER}>`,

    to: email,

    subject: 'KhetiMaster Email Verification OTP',

    html: `
      <!DOCTYPE html>

      <html>
        <head>
          <meta charset="UTF-8" />

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />

          <title>KhetiMaster OTP</title>
        </head>

        <body
          style="
            margin: 0;
            padding: 0;
            background-color: #f5f7f2;
            font-family: Arial, sans-serif;
          "
        >
          <div
            style="
              max-width: 500px;
              margin: 40px auto;
              background: #ffffff;
              padding: 35px;
              border-radius: 16px;
            "
          >

            <h1
              style="
                margin: 0 0 10px;
                color: #187c3a;
                text-align: center;
              "
            >
              KhetiMaster
            </h1>

            <p
              style="
                color: #555555;
                text-align: center;
                font-size: 16px;
              "
            >
              Verify your email address
            </p>

            <p
              style="
                color: #333333;
                font-size: 16px;
                margin-top: 30px;
              "
            >
              Your KhetiMaster verification code is:
            </p>

            <div
              style="
                margin: 25px 0;
                padding: 18px;
                background: #f1ffe8;
                border-radius: 12px;
                text-align: center;
              "
            >
              <span
                style="
                  font-size: 32px;
                  font-weight: bold;
                  letter-spacing: 8px;
                  color: #187c3a;
                "
              >
                ${otp}
              </span>
            </div>

            <p
              style="
                color: #666666;
                font-size: 14px;
                text-align: center;
              "
            >
              This OTP is valid for 5 minutes.
            </p>

            <p
              style="
                color: #999999;
                font-size: 13px;
                text-align: center;
                margin-top: 30px;
              "
            >
              If you did not request this code, you can safely
              ignore this email.
            </p>

          </div>
        </body>
      </html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export default sendOtpEmail;
