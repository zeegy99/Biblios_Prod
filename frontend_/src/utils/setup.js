export class Die {
  constructor(resource_type) {
    this.resource_type = resource_type;
    this.value = Math.floor(Math.random() * 3) + 2; 
  }
}

export const rollDice = () => [
  new Die("Art"),
  new Die("Herbs"),
   new Die("Military"),
  new Die("Religion"),
  new Die("Science"),
 
];
