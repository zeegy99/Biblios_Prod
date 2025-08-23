#Training my first RL bot
import matplotlib.pyplot as plt
import pygame as pg

class maze():
    def __init__ (self, maze, start_position, end_position):
        self.maze = maze
        self.height = len(maze)
        self.width = len(maze[0])
        self.start_position = start_position
        self.end_position = end_position

    def __repr__(self):
        print("This is some information about me", self.maze, self.height, self.width, self.start_position, self.end_position)
        return ""
    
    def showPygame(self):
        pass
        plt.plot()


    


maze_layout = [[0] * 3 for n in range(4)]
maze_layout[1][1] = 1
print(maze_layout)
start = [0, 0]
end = [2, 2]
new_maze = maze(maze_layout, start, end)

print(new_maze)

plt.plot([1, 2, 4, 8])
plt.ylabel('piss')
plt.show()