from shoe import Shoe
from player import Player
import random
from dice import Die
from cards import SpecialCard



class Game:
    def __init__ (self, player_names):
        self.players = [Player(name) for name in player_names]
        self.shoe = Shoe()
        self.current_phase = 'None'
        self.discard_pile = []
        self.shared_pool = []
        self.last_drawer = None
        self.dice = [
            Die("Religion"),
            Die("Science"),
            Die("Military"),
            Die("Art"),
            Die("Herbs"),
        ]

    def start_game(self):
        print("Game Starting")
        self.shoe.print_whole_deck()


    def play_dice_card(self, player, card):         ###Takes card and then 
        print(f"{player.name} is using dice modifier: {card.type} {card.value}")


        print("Dice:")
        for idx, die in enumerate(self.dice):
            print(f"{idx}: {die}")

     

        if card.type == "Both":
            while True:
                direction = input("Increase or decrease? (i/d): ").strip().lower()
                if direction == 'i':
                    card.type = "Plus"
                    break
                elif direction == 'd':
                    card.type = "Minus"
                    break
                else:
                    print("Invalid input. Type 'i' or 'd'.")
        else:
            card_type = card.type
        if card.value == 2:
            modified_indices = set()
            for i in range(2):
                print(f"\nChoose die #{i + 1} to {'increase' if card.type == 'Plus' else 'decrease'} by 1:")
                while True:
                    try:
                        idx = int(input(f"{player.name}, choose a different die (0-4): "))
                        if idx in modified_indices:
                            print("You already picked that die. Choose a different one.")
                        elif 0 <= idx < len(self.dice):
                            modified_indices.add(idx)
                            die = self.dice[idx]
                            if card.type == "Plus":
                                die.value = min(6, die.value + 1)
                            else:
                                die.value = max(1, die.value - 1)
                            print(f"{die.resource_type} die is now {die.value}")
                            break
                        else:
                            print("Invalid index.")
                    except ValueError:
                         print("Please enter a number.")
                         #Finish from here
        else:
            while True:
                try:
                    choice = int(input(f"{player.name}, choose which die to modify (0-4): "))
                    if 0 <= choice < len(self.dice):
                        target_die = self.dice[choice]
                        break
                    else:
                        print("Invalid die index.")
                except ValueError:
                    print("Enter a number between 0 and 4.")

            if card_type == "Plus":
                target_die.value = min(6, target_die.value + card.value)
            else:
                target_die.value = max(1, target_die.value - card.value)
                    
      

    def player_turn(self, player):
        num_to_draw = len(self.players) + 1
        kept = None
        discarded = None
        shared = []
        cards_to_process = []

        while len(cards_to_process) < num_to_draw:
            card = self.shoe.__draw__()
            print(f"Player {player} has drawn card {card}")

            if isinstance(card, SpecialCard):
                print(f"{player} plays the dice card instantly")
                self.play_dice_card(player, card)
                continue
            cards_to_process.append(card)
            


        for card in cards_to_process:
            print(f"{player.name}, you see: {card}")
            while True:
                choice = input("Please choose to discard (d), keep (k), or add it to the community pool (p): ")
                if choice == 'k':
                    if kept is not None:
                        print("You've already kept a card. ")
                        continue
                    kept = card
                    break

                elif choice == 'd':
                    if discarded is not None:
                        print("You've already discarded a card. ")
                        continue
                    discarded = card
                    break

                elif choice == 'p':
                    if len(shared) >= num_to_draw - 2:
                        print("You have put the max number into the community pile already.")
                        continue
                    shared.append(card)
                    break
                else:
                    print("Invalid input")

        player.hand.append(kept)
        if kept.type == "Gold":
            player.gold += kept.value
            print(f"{player.name} gains {kept.value} gold")
        elif isinstance(kept, SpecialCard):
            self.play_dice_card(player, kept)

        self.discard_pile.append(discarded)
        self.shared_pool.extend(shared)
     #   print(player.hand, self.discard_pile, self.shared_pool)

      #  print('test')
        self.offer_shared_cards(player)


    def offer_shared_cards(self, active_player): 
        print("\nOffering shared pool to other players:")

        num_players = len(self.players)
        start_index = self.players.index(active_player)

        # Go in order starting from the next player, wrapping around
        for i in range(1, num_players):
            player = self.players[(start_index + i) % num_players]

            if not self.shared_pool:
                print("No more cards left in the shared pool.")
                break

            print(f"\n{player.name}, here are the available shared cards:")

            # Create a filtered list of valid cards with their original index
            valid_cards = [(idx, card) for idx, card in enumerate(self.shared_pool)
                        if card is not None and getattr(card, "type", None) is not None]

            for display_idx, (real_idx, card) in enumerate(valid_cards):
                print(f"{display_idx}: {card}")

            while True:
                if not valid_cards:
                    print("All shared cards taken.")
                    break

                try:
                    choice = input(f"{player.name}, choose a card by number or press Enter to skip: ").strip()
                    if choice == "":
                        print(f"{player.name} skipped.")
                        break

                    choice = int(choice)
                    if 0 <= choice < len(valid_cards):
                        real_idx, chosen_card = valid_cards[choice]
                        self.shared_pool.pop(real_idx)

                        player.hand.append(chosen_card)
                        if chosen_card.type == "Gold":
                            player.gold += chosen_card.value
                        print(f"{player.name} took {chosen_card}")
                        break
                    else:
                        print("Invalid index.")
                except ValueError:
                    print("Please enter a valid number or press Enter to skip.")

        for i in self.players:
            print(i, i.hand)

          

    
    def auction(self): #Converted
        print("\n=== Starting Auction Phase ===\n")
        random.shuffle(self.discard_pile)

        num_players = len(self.players)
        start_index = (self.players.index(self.last_drawer) + 1) % len(self.players)

        for card in self.discard_pile:

            if card is None or getattr(card, 'type', None) is None:
                print("Skipping invalid card (None) in discard pile.")
                continue
            print(f"\nAuctioning card: {card}")
            active_bidders = {player: True for player in self.players}  # All start active
            bidding_order = [self.players[(start_index + i) % num_players] for i in range(num_players)]
            if card.type != "Gold":
                current_bid = 0
                highest_bidder = None

                
                

                while sum(active_bidders.values()) > 1:  # More than one active bidder
                    for player in bidding_order:
                        if not active_bidders[player]:
                            continue  # Player has passed

                        print(f"\nCurrent highest bid: ${current_bid} by {highest_bidder.name if highest_bidder else 'None'}")
                        choice = input(f"{player.name}, bid higher or pass? YOu currently have {player.gold} gold. (Enter amount or 'p' to pass): ").strip().lower()

                        if choice == 'p':
                            active_bidders[player] = False
                            print(f"{player.name} passes.")
                        else:
                            try:
                                bid = int(choice)
                                if bid <= current_bid:
                                    print("Bid must be higher than current bid.")
                                elif bid > player.gold:
                                    print(f"You only have ${player.gold}. You can't bid ${bid}.")
                                else:
                                    current_bid = bid
                                    highest_bidder = player
                            except ValueError:
                                print("Invalid input. Enter a number or 'p' to pass.")

                        # If only one player remains active, exit early
                        if sum(active_bidders.values()) == 1:
                            break


                if highest_bidder:
                    print(f"\n{highest_bidder.name} wins {card} for ${current_bid}")
                    highest_bidder.hand.append(card)
                    highest_bidder.gold -= current_bid
                    print(f"{highest_bidder.name} now has ${highest_bidder.gold}")
                    # optionally subtract current_bid from player.money here
                else:
                    print(f"No one bid on {card}. It is discarded permanently.")

                start_index = (start_index + 1) % num_players
            else:
                print("\n=== Gold-for-Cards Auction Phase ===\n")
                current_bid = 0
                highest_bidder = None
                
                while sum(active_bidders.values()) > 1:  # More than one active bidder
                    for player in bidding_order:
                        if not active_bidders[player]:
                            continue  # Player has passed

                        print(f"\nCurrent highest bid: {current_bid} Cards by {highest_bidder.name if highest_bidder else 'None'}")
                        choice = input(f"{player.name}, bid higher or pass? You currently have {len(player.hand)} number of cards. (Enter amount or 'p' to pass): ").strip().lower()

                        if choice == 'p':
                            active_bidders[player] = False
                            print(f"{player.name} passes.")
                        else:
                            try:
                                bid = int(choice)
                                if bid <= current_bid:
                                    print("Bid must be higher than current bid.")
                                elif bid > len(player.hand):
                                    print(f"You only have {len(player.hand)} cards. You can't bid {bid} cards.")
                                else:
                                    current_bid = bid
                                    highest_bidder = player
                            except ValueError:
                                print("Invalid input.")

                        # If only one player remains active, exit early
                        if sum(active_bidders.values()) == 1:
                            break


                if highest_bidder:
                    print(f"\n{highest_bidder.name} wins {card} for {current_bid}")
                    current_cards_discarded = 0
                    
                    
                    #Player discards the amount of cards from their hand.

                    while current_cards_discarded < current_bid:

                        print(f"\n{highest_bidder.name}'s hand:")
                        for i, c in enumerate(highest_bidder.hand):
                            print(f"{i}: {c}")
                        choice = input(f"Choose card index to discard ({current_cards_discarded + 1}/{current_bid}): ")
                        

                        try: 
                            idx = int(choice)
                            if 0 <= idx < len(highest_bidder.hand):
                                discarded = highest_bidder.hand.pop(idx)
                                self.discard_pile.append(discarded)
                                print(f"Discarded {discarded}")
                                current_cards_discarded += 1
                            else:
                                print("Invalid index.")
                        except ValueError:
                            print("Invalid input.")

                    #Player receives the auctioned card. 
                    highest_bidder.gold += card.value
                    print(f"{highest_bidder.name} has gained ${card.value}. They now have {highest_bidder.gold}")
                    highest_bidder.hand.append(card)
                else:
                    print(f"No one bid on {card}. It is discarded permanently.")
                    
            start_index = (start_index + 1) % num_players

        self.discard_pile = []


            
    def run(self):
               
        
        while self.shoe.__len__() > 0:
            for idx in range(len(self.players)):
                print(f"len deck {self.shoe.__len__()}")
                self.player_turn(self.players[idx])
                self.last_drawer = self.players[idx]
                print(f"new len deck {self.shoe.__len__()}")

        self.discard_pile = [card for card in self.discard_pile if card is not None and getattr(card, 'type', None) is not None]
        self.auction()
        self.score_game() 


    def add_card_values(self):
        for i in self.players:
            print(i)

    def score_game(self): #Goes through and adds everyone's scores
         


        print("\n final scoring phase")
        for location in self.dice:

            print(f"Scoring by resource and die value. Starting with {location.resource_type} with Die value of {location.value}")
            
            player_scores = {}
            for player in self.players:
                total = 0
                best_tie = 999
                for card in player.hand:
                    if card.type == location.resource_type:
                        total += card.value
                        best_tie = min(best_tie, ord(card.tie_breaker))

                player_scores[player] = (total, best_tie)
                print(f"{player.name}: Total = {total}, Best Tie-Breaker = {chr(best_tie) if best_tie != 999 else '—'}")


            max_score = max(score for score, _ in player_scores.values())
            contenders = [p for p, (score, _) in player_scores.items() if score == max_score]

            if len(contenders) == 1:
                winner = contenders[0]
                winner.points += location.value
                print(f"{winner.name} wins {location.resource_type} and gains {location.value} points!")
            else:
                # Tiebreaker logic
                best_tie = min(player_scores[p][1] for p in contenders)
                tie_winners = [p for p in contenders if player_scores[p][1] == best_tie]

                if len(tie_winners) == 1:
                    winner = tie_winners[0]
                    winner.points += location.value
                    print(f"Tiebreaker! {winner.name} wins {location.resource_type} and gains {location.value} points!")
                else:
                    print(f"Tie on {location.resource_type}. No points awarded.")
        print("\nFinal Scores:")
        for player in self.players:
            print(f"{player.name}: {player.points} points")

        max_points = max(p.points for p in self.players)
        winners = [p for p in self.players if p.points == max_points]
        if len(winners) == 1:
            print(f"\n🏆 {winners[0].name} wins the game!")
        else:
            # Break tie using gold
            max_gold = max(p.gold for p in winners)
            gold_winners = [p for p in winners if p.gold == max_gold]

            if len(gold_winners) == 1:
                print(f"\n🏆 {gold_winners[0].name} wins the game by gold tiebreaker!")
            else:
                print("\n🏆 The game ends in a complete tie between: " + ", ".join(p.name for p in gold_winners))

    

    def card_trade_auction(self):
        print("\n=== Gold-for-Cards Auction Phase ===\n")
        gold_cards = [card for card in self.discard_pile if getattr(card, "type", None) == "Gold"]
        if not gold_cards:
            print("No gold cards available for trade.")
            return

        for gold_card in gold_cards:
            print(f"\nAuctioning {gold_card.value} Gold")

            active_bidders = [player for player in self.players]
            bids = {}

            for player in active_bidders:
                while True:
                    try:
                        choice = input(f"{player.name}, how many cards will you trade for this gold (or 'p' to pass)? ").strip().lower()
                        if choice == 'p':
                            break
                        bid_count = int(choice)
                        if bid_count < 0 or bid_count > len(player.hand):
                            print(f"You only have {len(player.hand)} cards.")
                            continue
                        bids[player] = bid_count
                        break
                    except ValueError:
                        print("Enter a valid number or 'p'.")

            if not bids:
                print("No one bid. Gold card discarded.")
                continue

            # Determine winner
            max_bid = max(bids.values())
            top_bidders = [p for p, b in bids.items() if b == max_bid]

            if len(top_bidders) == 1:
                winner = top_bidders[0]
            else:
                # Resolve ties: can randomize or ask for tie-breaker rule
                winner = random.choice(top_bidders)
                print(f"Tie between {[p.name for p in top_bidders]}. {winner.name} wins randomly.")

            # Winner discards cards and gains gold
            print(f"{winner.name} wins {gold_card.value} gold by trading {max_bid} cards.")
            for _ in range(max_bid):
                for idx, card in enumerate(winner.hand):
                    print(f"{idx}: {card}")
                while True:
                    try:
                        discard_idx = int(input(f"{winner.name}, choose card to discard: "))
                        if 0 <= discard_idx < len(winner.hand):
                            discarded = winner.hand.pop(discard_idx)
                            self.discard_pile.append(discarded)
                            break
                        else:
                            print("Invalid index.")
                    except ValueError:
                        print("Enter a valid number.")

            winner.gold += gold_card.value
            print(f"{winner.name} now has {winner.gold} gold.")

        # Remove gold cards from discard pile
        self.discard_pile = [card for card in self.discard_pile if getattr(card, "type", None) != "Gold"]



        