"""Turn dist-solo/index.html into a page fragment for publishing as a Claude artifact
(the publisher adds its own doctype, head and body). Usage: python3 scripts/solo-artifact.py OUT"""
import re, sys
html = open('dist-solo/index.html', encoding='utf-8').read()
head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
head = re.sub(r'<meta[^>]*(charset|viewport)[^>]*>\s*', '', head)
title = re.search(r'<title>.*?</title>', head, re.S).group(0)
head = head.replace(title, '')
open(sys.argv[1], 'w', encoding='utf-8').write(title + '\n' + head.strip() + '\n' + body.strip() + '\n')
