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
  * directory       - contains log files needs to be compressed
  * fileNamePattern - a Regular Expression that matches the file; it should contain (?\<year>\d+), (?\<month>\d+) and (?\<day>\d+) capture groups

the only option is now supported `--help` shows the help message
