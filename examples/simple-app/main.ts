// Simple example Deno app for testing Denploy
// This app will be deployed to the platform

const port = parseInt(Deno.env.get("PORT") || "8000");
const appName = Deno.env.get("APP_NAME") || "example-app";

console.log(`Starting ${appName} on port ${port}`);

Deno.serve({ port }, (req) => {
  const url = new URL(req.url);

  // Health check endpoint
  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Main page
  return new Response(
    `<!DOCTYPE html>
<html>
<head>
  <title>${appName}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      margin-bottom: 20px;
    }
    .info {
      background: #e7f3ff;
      padding: 15px;
      border-radius: 4px;
      margin: 20px 0;
    }
    .success {
      color: #28a745;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="success">🎉 Your app is running!</h1>
    <p>Welcome to <strong>${appName}</strong></p>
    <div class="info">
      <p><strong>App Name:</strong> ${appName}</p>
      <p><strong>Port:</strong> ${port}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
      <p><strong>Deno Version:</strong> ${Deno.version.deno}</p>
    </div>
    <p>This is a simple example app deployed on Denploy!</p>
    <p>Edit main.ts and redeploy to see your changes.</p>
  </div>
</body>
</html>`,
    {
      headers: { "Content-Type": "text/html" },
    }
  );
});
