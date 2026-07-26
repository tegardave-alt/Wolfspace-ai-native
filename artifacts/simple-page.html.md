# Halaman HTML Sederhana

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Halo dari WOLFSPACE</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .card {
            background: rgba(255,255,255,0.08);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255,255,255,0.15);
            border-radius: 24px;
            padding: 48px 56px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        h1 { color: #fff; font-size: 2.4rem; font-weight: 600; }
        p { color: rgba(255,255,255,0.7); margin-top: 16px; font-size: 1.1rem; }
        .btn {
            display: inline-block; margin-top: 28px; padding: 12px 32px;
            background: #6c63ff; color: #fff; border: none; border-radius: 40px;
            font-size: 1rem; cursor: pointer; transition: .3s;
        }
        .btn:hover { background: #5a52e0; transform: translateY(-2px); box-shadow: 0 8px 24px rgba(108,99,255,0.4); }
    </style>
</head>
<body>
    <div class="card">
        <h1>✨ Halo, Dave!</h1>
        <p>Ini adalah halaman HTML sederhana yang dibuat oleh WOLFSPACE.</p>
        <button class="btn" onclick="alert('Halo dari WOLFSPACE! 👋')">Klik Saya</button>
    </div>
</body>
</html>
