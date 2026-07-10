import re
with open('agent/public/app.jsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = re.sub(r'[ \t]*</span>\r?\n', '', c)
with open('agent/public/app.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Fixed')
