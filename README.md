# compress-logs

## Installation

Clone this to `/usr/local/lib/compress_logs`

```bash
git clone https://github.com/davramenko/compress-logs.git /usr/local/lib/compress_logs
```

Install dependencies:
```bash
cd /usr/local/lib/compress_logs && npm i
```

Link executable to the `bin` directory:
```bash
ln -s /usr/local/lib/compress_logs/scripts/compress_logs.sh /usr/local/bin/compress_logs
```

## Usage

```bash
/usr/local/bin/compress_logs <directory> <fileNamePattern> [OPTIONS]
```
### Arguments
 | argument        | description                                                                                                                 |
 |-----------------|-----------------------------------------------------------------------------------------------------------------------------|
 | directory       | contains log files needs to be compressed                                                                                   |
 | fileNamePattern | a Regular Expression that matches the file; it should contain (?\<year>\d+), (?\<month>\d+) and (?\<day>\d+) capture groups |

### Options

| name                  | description                                                                                                               |
|-----------------------|---------------------------------------------------------------------------------------------------------------------------|
| ‑‑help                | shows the help message                                                                                                    |
| ‑‑keep‑files          | the number of compressed files kept after the compression; should be more than 1 otherwise old files would not be removed |
| ‑‑compressed‑pattern  | a suffix for filename pattern which is appended to match the compressed file; default: '\.xz$'                            |

