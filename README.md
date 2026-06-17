# Goofgram Online

This is the version you use when you want other people to access the app.

Unlike the first local prototype, this one has:

- A Node.js server
- Shared user accounts
- Shared posts
- Shared follows
- Live direct messages with Socket.IO
- A small `database.json` file that gets created automatically

## Run It On Your Computer

Install Node.js from https://nodejs.org first.

Then open a terminal in this folder and run:

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Demo login:

```text
username: maya
password: demo123
```

## Let People On Your Wi-Fi Access It

After running `npm start`, find your computer's local IP address.

On Windows:

```bash
ipconfig
```

Look for something like:

```text
IPv4 Address . . . . . . . . . . : 192.168.1.25
```

Other people on the same Wi-Fi can open:

```text
http://YOUR-IP-ADDRESS:3000
```

Example:

```text
http://192.168.1.25:3000
```

If it does not load, Windows Firewall may be blocking Node.js. Allow Node.js through the firewall.

## Put It Online For Everyone

Use a hosting service that supports Node.js apps, such as:

- Render
- Railway
- Fly.io
- DigitalOcean

For Render, the basic settings are:

```text
Build Command: npm install
Start Command: npm start
```

After deployment, Render gives you a public URL. Send that URL to people.

## Important Before A Real Launch

This is a starter app. Before using it as a real public social network, upgrade these parts:

- Use PostgreSQL or MongoDB instead of `database.json`
- Add stronger session security
- Add image uploads instead of image URLs
- Add moderation/reporting tools
- Add rate limits to stop spam
- Add password reset

