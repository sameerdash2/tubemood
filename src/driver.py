from flask import Flask, request, jsonify
from transformers import pipeline
from bs4 import BeautifulSoup
from collections import defaultdict

app = Flask(__name__)

# Create a sentiment analysis pipeline to run via PyTorch
sentiment_pipeline = pipeline("sentiment-analysis",
                              model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                              tokenizer="cardiffnlp/twitter-roberta-base-sentiment-latest",
                              device=0,
                              max_length=512,
                              truncation=True)


@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.data.decode('utf-8')
    # Convert comments from HTML to plain text
    plaintext_data = [BeautifulSoup(comment, features='lxml').get_text('\n') for comment in data.splitlines()]

    # Run pipeline on comments
    analyses = sentiment_pipeline(plaintext_data)

    # Compute an aggregated proportion for each label - X% positive, Y% negative, Z% neutral
    score_by_label = defaultdict(float)
    for result in analyses:
        score_by_label[result['label']] += result['score']
    total = sum(score_by_label.values())
    proportions = {label: v/total for label, v in score_by_label.items()}

    return jsonify({
        'proportions': proportions,
        'analyses': analyses
    })

if __name__ == '__main__':
    app.run(port=6001)
