class Card:
    def __init__(self, value, type, tie_breaker):
        self.value = value
        self.type = type
        self.tie_breaker = tie_breaker

    def __repr__(self):
        return f"{self.value}, {self.type}, {self.tie_breaker}"
    
    
class SpecialCard:
    def __init__(self, value, pm):
        self.value = value
        self.type = pm

    def __repr__(self):
        return f"{self.value}, {self.type}"

        
