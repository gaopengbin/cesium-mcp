import json
import sys
from collections import Counter
from PIL import Image

pixels = Counter(Image.open(sys.argv[1]).convert('RGB').getdata())
result = {'blue': pixels[(56, 189, 248)], 'orange': pixels[(255, 136, 0)]}
print(json.dumps(result))
sys.exit(0 if result['orange'] > 100 and result['blue'] < 20 else 1)
