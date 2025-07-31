from cards import Card
from cards import SpecialCard
import random

class Shoe:
    def __init__(self):
        self.deck = []
        self.build_deck()
        random.shuffle(self.deck)


    def build_deck(self):
        card_q = {1: 1, 2: 0, 3: 0, 4: 0} #Was {1: 7, 2: 4, 3: 2, 4: 1}, now changed to all 1
        resource_types = ["Religion", "Science", "Military", "Art", "Herbs"]
        tie_breakers = ['A', 'B', 'C', 'D']

        for res in resource_types:
            for val, quantity in card_q.items():
                for _ in range(1): #changed quantity to 1 from 3
                    tie = random.choice(tie_breakers)
                    self.deck.append(Card(val, res, tie))

        #Adding in the gold cards changed from 7 to 1
        for _ in range(1):
            for k in range(1, 3):
                self.deck.append(Card(k, 'Gold', 'None'))

        #Adding in the dice manipulation cards
        # for _ in range(1): #changed 
        #     self.deck.append(SpecialCard(1, "Plus"))
        #     self.deck.append(SpecialCard(1, "Minus"))
        #     self.deck.append(SpecialCard(2, "Plus"))
        #     self.deck.append(SpecialCard(2, "Minus"))
            # self.deck.append(SpecialCard(1, "Both"))
            # self.deck.append(SpecialCard(2, "Both"))
            

    def __len__(self):
        return len(self.deck)
    
    def __draw__(self):
        return self.deck.pop() if self.deck else None

    def print_whole_deck(self):
        for i in self.deck:
            print(i)

       # print("I finished")