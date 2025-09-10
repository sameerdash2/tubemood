import { formatTitle, formatComment, eta, parseDurationMSS } from './util.js';
import Chart from "chart.js/auto";

export class Video {
    constructor(socket) {
        this._socket = socket;
        this.reset();
    }
    reset() {
        this.commentNum = 0;
        this.currentSort = "dateOldest";

        this.options = {
            timezone: document.querySelector('input[name="timezone"]:checked').value,
            showImg: !document.getElementById("noImg").checked,
        };

        this._storedReplies = {};
        this._displayedReplies = new Set();
    }

    display(video) {
        const commentThreadsGuess = Math.floor(Number(video.statistics.commentCount) * 0.8);
        this._totalExpected = Math.min(commentThreadsGuess, 1000); // for load percentage
        this._videoId = video.id;
        this.videoPublished = video.snippet.publishedAt; // for graph bound
        this._uploaderId = video.snippet.channelId; // for highlighting OP comments
        document.getElementById("message").textContent = "\u00A0";
        formatTitle(video, this.options);
        document.getElementById("videoColumn").style.display = "block";
    }

    prepareLoadStatus() {
        document.getElementById("linkedHolder").textContent = "";
        document.getElementById("linkedColumn").style.display = "none";
        this._linkedParent = this._currentLinked = null;

        document.getElementById("loadPercentage").textContent = "Initializing...";

        document.getElementById("loadStatus").style.display = "block";
    }

    updateLoadStatus(count) {
        if (this._totalExpected === 0) {
            return;
        }
        // Determine percentage precision based on total comment count
        // An "update" includes 100 or more comments
        // 1,000+ comments takes at least 10 updates, so use 2 digits (no decimals)
        // 10,000+ comments takes at least 100 updates, so use 3 digits (1 decimal place)
        const precision = Math.max(0, Math.floor(Math.log10(this._totalExpected)) - 3);
        const percentage = (count / this._totalExpected * 100).toFixed(precision) + '%';

        document.getElementById("progressGreen").style.width = percentage;
        document.getElementById("progressGreen").ariaValueNow = percentage;

        document.getElementById("loadPercentage").textContent = percentage;
        const countString = Number(count).toLocaleString() + " / " + Number(this._totalExpected).toLocaleString();
        document.getElementById("loadCount").textContent = `(${countString} comments indexed)`;
    }

    handleGroupComments(reset, items) {
        if (reset) {
            this.commentNum = 0;
            // Clear stored replies so they can be re-fetched on sorting change
            // (also cause it makes the logic simpler)
            this._storedReplies = {};
            this._displayedReplies = new Set();
        }
        let add = "";
        const paddingX = this.options.showImg ? "2" : "3";
        for (let i = 0; i < items.length; i++) {
            this.commentNum++;

            add += `<li class="list-group-item comment py-2 px-${paddingX}">`
                + formatComment(items[i], this.commentNum, this.options, this._uploaderId, this._videoId, false) + `</li>`;
        }
        document.getElementById("commentsSection").insertAdjacentHTML('beforeend', add);
    }

    handleNewReplies(id, replies) {
        // Intent: store replies in date-ascending order.
        // Verify the order, in case the YT API folks decide to flip the order of returned replies
        // on a whim like they did in October 2023.
        if (replies.length >= 2 && new Date(replies[0].publishedAt) > new Date(replies[1].publishedAt)) {
            replies.reverse();
        }
        this._storedReplies[id] = replies;

        this.populateReplies(id);
    }

    handleRepliesButton(button) {
        const commentId = button.id.substring(11);
        if (this._storedReplies[commentId]) {
            if (this._displayedReplies.has(commentId)) {
                document.getElementById("repliesEE-" + commentId).style.display = "none";
                button.textContent = `\u25BC Show ${this._storedReplies[commentId].length} replies`;
                this._displayedReplies.delete(commentId);
            }
            else {
                document.getElementById("repliesEE-" + commentId).style.display = "block";
                button.textContent = `\u25B2 Hide ${this._storedReplies[commentId].length} replies`;
                this._displayedReplies.add(commentId);
            }
        }
        else {
            button.disabled = true;
            button.textContent = "Loading...";
            this._socket.emit("replyRequest", commentId);
        }
    }

    populateReplies(commentId) {
        const len = this._storedReplies[commentId].length;
        let newContent = "";
        let lClass;
        for (let i = 0; i < len; i++) {
            lClass = this._storedReplies[commentId][i].id === this._currentLinked ? " linked" : "";

            newContent += `<div class="mt-2${lClass}">`
                + formatComment(this._storedReplies[commentId][i], i + 1, this.options,
                    this._uploaderId, this._videoId, true) + `</div>`;
        }
        document.getElementById("repliesEE-" + commentId).innerHTML = newContent;
        this._displayedReplies.add(commentId);
        document.getElementById("getReplies-" + commentId).textContent = `\u25B2 Hide ${len} replies`;
        document.getElementById("getReplies-" + commentId).disabled = false;
    }

    handleLinkedComment(parent, reply) {
        this._linkedParent = parent.id;
        this._currentLinked = reply ? reply.id : parent.id;

        document.getElementById("linkedHolder").innerHTML =
            formatComment(parent, -1, this.options, this._uploaderId, this._videoId, false);
        if (reply) {
            document.getElementById("repliesEE-" + parent.id).innerHTML =
                `<div class="mt-2 linked">`
                + formatComment(reply, -1, this.options, this._uploaderId, this._videoId, true)
                + `</div>`;
        }

        document.getElementById("linkedColumn").style.display = "block";
    }

    floatToPercentString(val) {
        if (isNaN(val)) {
            return `--`;
        } else {
            return (val * 100).toFixed(1) + '%';
        }
    }

    handleStatsData(data) {
        document.getElementById("s_pos").textContent = this.floatToPercentString(data.positive);
        document.getElementById("s_neg").textContent = this.floatToPercentString(data.negative);
        document.getElementById("s_neu").textContent = this.floatToPercentString(data.neutral);

        const chartData = {
            labels: [
                'Positive',
                'Neutral',
                'Negative'
            ],
            datasets: [{
                label: 'Score',
                data: [data.positive, data.neutral, data.negative],
                backgroundColor: [
                    'rgb(108, 250, 108)',
                    '#ddd',
                    'rgb(255, 99, 132)'
                ],
                hoverOffset: 4
            }]
        };
        const chart = new Chart(document.getElementById('the-chart'), {
            type: 'pie',
            data: chartData,
            options: {
                plugins: {
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }

    handleWindowResize() {
        return;
    }
}