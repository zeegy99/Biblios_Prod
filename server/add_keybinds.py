import os, smtplib, ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import secrets, datetime

load_dotenv()
sender = "fred.yuan392@gmail.com"
rcpt = "ferdisapotat@gmail.com"
pwd = os.getenv("APP_PASSWORD", "").replace(" ", "").strip()  # app pw

msg = MIMEMultipart()
msg["From"] = sender
msg["To"] = rcpt
msg["Subject"] = "Forgot Password From Biblios"

reset_token = secrets.token_urlsafe(32)
expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=1)


print(reset_token, expiry)
msg.attach(MIMEText(u'Click this link to reset your password to the legendary BIBLIOS GAME <a href="https://biblios-game-' \
'frontend.onrender.com/password_change/{reset_token}"> Reset Link</a> This link will expire in 1 hour. ','html'))

#eed to create a token that goes i
context = ssl.create_default_context()
with smtplib.SMTP("smtp.gmail.com", 587, timeout=30) as s:
    s.set_debuglevel(1)             # see SMTP dialogue in console
    s.ehlo()
    s.starttls(context=context)
    s.ehlo()
    s.login(sender, pwd)
    s.sendmail(sender, rcpt, msg.as_string())
print("sent")
