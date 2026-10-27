"""Fetch only pg_dump/pg_restore from the official pinned EDB Windows archive."""
import io
import shutil
import urllib.request
import zipfile
from pathlib import Path

URL = 'https://get.enterprisedb.com/postgresql/postgresql-18.4-1-windows-x64-binaries.zip'

class RemoteZip(io.RawIOBase):
    def __init__(self):
        with urllib.request.urlopen(urllib.request.Request(URL, method='HEAD'), timeout=30) as response:
            self.length = int(response.headers['Content-Length'])
        self.position = 0
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.length + offset
        return self.position
    def read(self, size=-1):
        size = min(self.length-self.position, size if size >= 0 else self.length-self.position)
        if size <= 0: return b''
        request = urllib.request.Request(URL, headers={'Range': f'bytes={self.position}-{self.position+size-1}'})
        with urllib.request.urlopen(request, timeout=60) as response:
            if response.status != 206: raise RuntimeError('Server did not honor range request')
            data = response.read()
        self.position += len(data)
        return data

root = Path(__file__).resolve().parents[1]
destination = root / '.local/pg-client'
destination.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(RemoteZip()) as archive:
    for name in ['pg_dump.exe', 'pg_restore.exe']:
        path = next(n for n in archive.namelist() if n.endswith('/bin/' + name))
        (destination/name).write_bytes(archive.read(path))
        print('Downloaded official PostgreSQL client:', name)
for dll in (root/'node_modules/@embedded-postgres/windows-x64/native/bin').glob('*.dll'):
    shutil.copy2(dll, destination/dll.name)
print('Local recovery clients ready:', destination)
