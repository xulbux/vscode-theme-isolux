import random

for i in range(10, 0, -1):
    rand_num = random.randint(1, 10) + i
    print(f"Number: {rand_num}")
