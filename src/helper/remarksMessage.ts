import axios from "axios";

  async function sendRemarksMessageViaSms(phone: string, otp: string) {
    try {
      // Send OTP via SMS using Fast2SMS API
      const fast2smsApiKey =
        process.env.FAST2SMS_API_KEY! ||
        "IXjRJ6DPuaTqy4M5Sxk9CwlgWctYnL0O1B2Qo8pAzhfGEZKU7sDJzdRbOP96nXZF4LifwHlx5k1GrhMB";
      const message = `Your OTP is ${otp}. This OTP is valid for 10 minutes.`;
      // 1201172171239468318
      const url = `https://www.fast2sms.com/dev/bulkV2`;

      const response = await axios.post(
        url,
        {
          sender_id: "INTERZ",
          message: "181436",
          variables_values: otp,
          route: "dlt",
          numbers: phone,
        },
        {
          headers: {
            authorization: fast2smsApiKey,
            "Content-Type": "application/json",
          },
        }
      );
      if (response.status === 200) {
        console.log("OTP sent successfully");
        return;
      } else {
        console.error("Failed to send OTP:", response.data);
        throw new Error("Failed to send OTP");
      }
    } catch (error) {
      console.error("Error sending OTP via SMS:", error);
      throw error;
    }
  }