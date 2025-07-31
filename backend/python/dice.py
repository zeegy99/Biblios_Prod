import random

class Die:
    def __init__(self, resource_type):
        self.resource_type = resource_type  # e.g. "Religion", "Science"
        self.value = random.randint(2, 4)   # Initial random value
        self.locked = False                # Set to True during auction
        self.visible = True                # Optional: for showing/hiding in phases

    def roll(self):
        if not self.locked:
            self.value = random.randint(1, 6)

    def lock(self):
        self.locked = True

    def unlock(self):
        self.locked = False

    def add(self):
        self.value += 1
    
    def subtract(self):
        self.value -= 1

    def __repr__(self):
        return f"{self.resource_type} Die: {self.value}{' (locked)' if self.locked else ''}"