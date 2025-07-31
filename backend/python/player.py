class Player:
    def __init__ (self, name):
        self.name = name 
        self.hand = []
        self.gold = 0
        self.points = 0
        self.cards = len(self.hand)

    def draw(self, card):
        self.hand.append(card)

    def play_card(self, card):
        self.hand.remove(card)

    def __repr__(self):
        return (f"{self.name}")
    
    def __str__(self):
        return (f"Player: {self.name}, Gold: {self.gold}, Hand: {self.hand}")