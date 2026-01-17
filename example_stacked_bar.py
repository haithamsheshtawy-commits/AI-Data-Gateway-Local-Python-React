"""
Example: Generate a Stacked Bar Chart from CSV Data
This script demonstrates how to create stacked bar charts that will be automatically
displayed in the interface.
"""

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np

# Read the CSV file (will be automatically replaced with actual path)
df = pd.read_csv('file.csv')

# Display basic info about the dataset
print(f"Dataset shape: {df.shape}")
print(f"Columns: {list(df.columns)}")

# Example 1: Stacked Bar Chart by Category
# Group data by a category and aggregate values
if 'Date' in df.columns or 'date' in df.columns:
    date_col = 'Date' if 'Date' in df.columns else 'date'
    
    # Get numeric columns for stacking
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    
    if len(numeric_cols) >= 2:
        # Create stacked bar chart with multiple series
        df_grouped = df.groupby(date_col)[numeric_cols[:3]].sum()
        
        # Create the plot
        fig, ax = plt.subplots(figsize=(12, 6))
        df_grouped.plot(kind='bar', stacked=True, ax=ax, colormap='viridis')
        
        ax.set_title('Stacked Bar Chart - Data by Date', fontsize=16, fontweight='bold')
        ax.set_xlabel(date_col, fontsize=12)
        ax.set_ylabel('Values', fontsize=12)
        ax.legend(title='Categories', bbox_to_anchor=(1.05, 1), loc='upper left')
        plt.xticks(rotation=45, ha='right')
        plt.tight_layout()
        plt.show()
        
        # Print summary statistics
        print("\nSummary by Date:")
        print(df_grouped.sum())
    else:
        print("Not enough numeric columns for stacked chart")
else:
    print("No Date column found in the dataset")

# Example 2: Simple aggregation stacked bar
# If you want to create your own data for stacking:
categories = ['Category A', 'Category B', 'Category C']
values1 = [23, 45, 32]
values2 = [15, 30, 25]
values3 = [10, 15, 20]

fig, ax = plt.subplots(figsize=(10, 6))

x = np.arange(len(categories))
width = 0.6

p1 = ax.bar(x, values1, width, label='Series 1', color='#4caf50')
p2 = ax.bar(x, values2, width, bottom=values1, label='Series 2', color='#2196f3')
p3 = ax.bar(x, values3, width, bottom=np.array(values1) + np.array(values2), 
            label='Series 3', color='#ff9800')

ax.set_title('Custom Stacked Bar Chart Example', fontsize=16, fontweight='bold')
ax.set_ylabel('Values', fontsize=12)
ax.set_xticks(x)
ax.set_xticklabels(categories)
ax.legend()
plt.tight_layout()
plt.show()

print("\nChart generation complete!")
