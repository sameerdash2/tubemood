from transformers import pipeline
from bs4 import BeautifulSoup
from collections import defaultdict
import json

# Create a sentiment analysis pipeline to run via PyTorch
sentiment_pipeline = pipeline("sentiment-analysis",
                              model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                              tokenizer="cardiffnlp/twitter-roberta-base-sentiment-latest",
                              device=0)

# Read comments file written by Node process
with open('comments.txt', 'r', encoding='utf-8') as file:
    data = [line.strip('\n') for line in file.readlines()]

# Convert comments from HTML to plain text
plaintext_data = [BeautifulSoup(comment, features='lxml').get_text('\n') for comment in data]

# print(plaintext_data)

# Run pipeline on comments
analyses = sentiment_pipeline(plaintext_data)

# Write individual sentiment scores to a JSON file for Node
with open('sentiment.json', 'w', encoding='utf-8') as json_file:
    json.dump(analyses, json_file, ensure_ascii=False)

# Compute an aggregated proportion for each label - X% positive, Y% negative, Z% neutral
score_by_label = defaultdict(float)
for result in analyses:
    score_by_label[result['label']] += result['score']
total = sum(score_by_label.values())
proportions = {label: v/total for label, v in score_by_label.items()}

# Write proportions to a JSON file for Node
with open('proportions.json', 'w', encoding='utf-8') as json_file:
    json.dump(proportions, json_file, ensure_ascii=False)
