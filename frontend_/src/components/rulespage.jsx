import React from "react";
import "./rulespage.css"; // styles defined below

const RulesPage = ({ onClose }) => {
  return (
    <div className="rules-overlay">
      <div className="rules-container">
        <button className="close-button" onClick={onClose}>✖</button>

        <h1 className="game-title">Biblios</h1>
        <p>
          In this game we draw from the deck until the deck is gone. While drawing, you will collect cards relating to categories. The 5 categories
          are Religion, Science, Military, Art, and Herbs. <div>
             <img src={`/rules_p.png`}/>
          </div>
        </p>
        <p>
          The values next to the region represents how valuable the region is. At the end of the game, the player with the most points in Each
          region wins all of the points associated with the region.
        </p>

        <div className="note-box">
          <strong>Please note:</strong> Tiebreaks are currently not working, and will not be working for a while. If it is a tie no one gains the points.
          For total point tiebreakers, it will be based on gold. 
        </div>

        <h2>Drawing Cards / Player Turns</h2>
        <p>Players make turns one after another. During your turn, you will draw a total of #Players + 1 cards sequentially.
            With each draw, you can choose to <strong>Keep</strong>, <strong>Discard</strong>, or <strong>Share</strong> each card. </p>

        <p>
          During your turn you can only Keep and Discard one card. You must share a card for each other player in the game. 
        </p>
        <p>
          The card you choose to keep gets added to your hand. The discarded card gets added to a discard pile. Then, the remaining players will
          choose from the cards you Shared sequentially. This concludes the end of your turn and then it becomes the next player's turn. Continue until all cards are drawn.
        </p>

        <h3> Auction Phase</h3>
        <p>
            Now that we have drawn the whole deck, we have a discard pile. If there is a region card, you will spend gold and auction
            against the other players. If you choose to pass on a card, you may not bid on that same card later on.
        </p>
        <p>
            Sometimes gold cards will be discarded. You bid on those with # of cards. You may discard gold cards to gain gold. For example, 
            if someone bids 4 for a gold card, they will have to discard 4 seperate cards. 
        </p>

    
      </div>
    </div>
  );
};

export default RulesPage;
