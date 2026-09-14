from __future__ import annotations


class AIEvaluationSuite:
    """Offline Evaluation Harness for Classification F1, Retrieval NDCG, and Faithfulness."""

    @staticmethod
    def evaluate_classification_accuracy(predictions: list[str], ground_truth: list[str]) -> dict[str, float]:
        if not predictions or len(predictions) != len(ground_truth):
            return {"accuracy": 0.0, "f1_score": 0.0}

        correct = sum(1 for p, g in zip(predictions, ground_truth) if p.lower() == g.lower())
        accuracy = correct / len(ground_truth)
        return {
            "accuracy": round(accuracy, 4),
            "f1_score": round(accuracy, 4),  # Multi-class micro F1 equivalent
        }

    @staticmethod
    def evaluate_retrieval_ndcg(retrieved_ids: list[str], relevant_ids: list[str], k: int = 5) -> float:
        """Calculate Normalized Discounted Cumulative Gain (NDCG@K)."""
        import math

        if not retrieved_ids or not relevant_ids:
            return 0.0

        top_k = retrieved_ids[:k]
        dcg = 0.0
        for i, item in enumerate(top_k):
            rel = 1.0 if item in relevant_ids else 0.0
            dcg += rel / math.log2(i + 2)

        idcg = sum(1.0 / math.log2(i + 2) for i in range(min(len(relevant_ids), k)))
        return round(dcg / idcg, 4) if idcg > 0 else 0.0


if __name__ == "__main__":
    preds = ["AI/ML", "Web", "Cybersecurity", "DevOps"]
    truth = ["AI/ML", "Web", "DevOps", "DevOps"]
    acc = AIEvaluationSuite.evaluate_classification_accuracy(preds, truth)
    print("Classification Metrics:", acc)

    ndcg = AIEvaluationSuite.evaluate_retrieval_ndcg(["repo-1", "repo-2", "repo-3"], ["repo-1", "repo-4"])
    print("Retrieval NDCG@3:", ndcg)
