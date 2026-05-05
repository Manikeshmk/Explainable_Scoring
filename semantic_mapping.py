import pandas as pd
import numpy as np
import warnings
from sentence_transformers import SentenceTransformer, util
# Disable futurewarnings from huggingface/transformers
warnings.simplefilter(action='ignore', category=FutureWarning)

from anchor_extraction import load_dataset, process_dataset_anchors

class SemanticMapper:
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        print(f"Loading SentenceTransformer model: {model_name}")
        self.model = SentenceTransformer(model_name)
    
    def compute_jaccard_similarity(self, text1, text2):
        """Computes Jaccard similarity between two strings."""
        set1 = set(text1.lower().split())
        set2 = set(text2.lower().split())
        if not set1 or not set2:
            return 0.0
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        return intersection / union

    def compute_edit_distance_similarity(self, text1, text2):
        """Computes a normalized Levenshtein edit distance similarity."""
        import Levenshtein
        if not text1 and not text2:
            return 1.0
        if not text1 or not text2:
            return 0.0
        
        distance = Levenshtein.distance(text1.lower(), text2.lower())
        max_len = max(len(text1), len(text2))
        
        # Returns 1.0 for identical strings, 0.0 for completely different
        return 1.0 - (distance / max_len)

    def evaluate_student_answer(self, student_answer, anchors):
        """
        Evaluates a student's answer against a list of desired anchors.
        Returns aggregated features.
        """
        if not isinstance(student_answer, str) or not student_answer.strip():
            # Return zeros for empty answers
            return {
                'max_semantic_sim': 0.0,
                'min_semantic_sim': 0.0,
                'anchors_covered_40': 0.0,
                'anchors_covered_50': 0.0,
                'avg_jaccard': 0.0,
                'answer_length': 0.0,
                'normalized_coverage': 0.0,
                'semantic_percentile_80': 0.0,
                'max_semantic_weighted': 0.0
            }
        
        if not anchors:
            # Handle case with no anchors
            return {
                'max_semantic_sim': 0.0,
                'min_semantic_sim': 0.0,
                'anchors_covered_40': 0.0,
                'anchors_covered_50': 0.0,
                'avg_jaccard': 0.0,
                'answer_length': 0.0,
                'normalized_coverage': 0.0,
                'semantic_percentile_80': 0.0,
                'max_semantic_weighted': 0.0
            }

        student_embedding = self.model.encode(student_answer, convert_to_tensor=True)
        anchor_embeddings = self.model.encode(anchors, convert_to_tensor=True)
        
        # Calculate cosine similarities between student answer and all anchors
        # The result is a 1 x num_anchors tensor
        cosine_scores = util.cos_sim(student_embedding, anchor_embeddings)[0].cpu().numpy()
        
        # Calculate lexical metrics against each anchor
        jaccard_scores = [self.compute_jaccard_similarity(student_answer, anchor) for anchor in anchors]
        
        # Answer length features
        answer_words = len(student_answer.split())
        anchor_words = np.mean([len(a.split()) for a in anchors]) if anchors else 1
        word_ratio = min(answer_words / max(anchor_words, 1), 2.0)  # cap at 2.0
        
        # Improved coverage metrics with multiple thresholds
        coverage_threshold_40 = 0.40
        coverage_threshold_50 = 0.50
        
        covered_40 = float(np.sum(cosine_scores >= coverage_threshold_40) / len(anchors))
        covered_50 = float(np.sum(cosine_scores >= coverage_threshold_50) / len(anchors))
        
        # Percentile-based coverage (80th percentile of cosine scores)
        percentile_80 = float(np.percentile(cosine_scores, 80))
        
        # Max semantic weighted by word ratio (heavily biased toward max similarity)
        max_semantic_weighted = float(np.max(cosine_scores)) * (0.7 + 0.3 * min(word_ratio, 1.0))
        
        features = {
            'max_semantic_sim': float(np.max(cosine_scores)),
            'min_semantic_sim': float(np.min(cosine_scores)),
            'anchors_covered_40': covered_40,
            'anchors_covered_50': covered_50,
            'avg_jaccard': float(np.mean(jaccard_scores)),
            'answer_length': min(word_ratio, 1.0),  # normalized, capped at 1.0
            'normalized_coverage': (covered_40 + covered_50) / 2.0,  # average of both thresholds
            'semantic_percentile_80': percentile_80,
            'max_semantic_weighted': max_semantic_weighted
        }
        
        return features

def generate_features(df):
    """Generates features for the entire dataframe."""
    mapper = SemanticMapper()
    
    print("Generating semantic mapping features...")
    # Initialize lists to hold feature columns
    max_sem = []
    min_sem = []
    cov_40 = []
    cov_50 = []
    avg_jac = []
    ans_len = []
    norm_cov = []
    sem_p80 = []
    max_sem_w = []
    
    # Process each row
    total_rows = len(df)
    for idx, row in df.iterrows():
        if idx % 100 == 0:
            print(f"Processing row {idx}/{total_rows}...")
            
        features = mapper.evaluate_student_answer(row['student_answer'], row['anchors'])
        
        max_sem.append(features['max_semantic_sim'])
        min_sem.append(features['min_semantic_sim'])
        cov_40.append(features['anchors_covered_40'])
        cov_50.append(features['anchors_covered_50'])
        avg_jac.append(features['avg_jaccard'])
        ans_len.append(features['answer_length'])
        norm_cov.append(features['normalized_coverage'])
        sem_p80.append(features['semantic_percentile_80'])
        max_sem_w.append(features['max_semantic_weighted'])
        
    # Add new feature columns to the dataframe
    df['feat_max_semantic'] = max_sem
    df['feat_min_semantic'] = min_sem
    df['feat_cov_40'] = cov_40
    df['feat_cov_50'] = cov_50
    df['feat_avg_jaccard'] = avg_jac
    df['feat_answer_length'] = ans_len
    df['feat_normalized_coverage'] = norm_cov
    df['feat_semantic_p80'] = sem_p80
    df['feat_max_semantic_weighted'] = max_sem_w
    
    print("Feature generation complete.")
    return df

if __name__ == "__main__":
    file_path = "C:/Users/deii/Desktop/cloud/mohler_dataset_edited.csv"
    try:
        # Load data
        df = load_dataset(file_path)
        
        # Take a sample for testing 
        df_sample = df.head(10).copy()
        
        # Step 1: Extract anchors from desired answers
        df_sample = process_dataset_anchors(df_sample)
        
        # Step 2: Generate Features mapping student_answer against anchors
        df_featured = generate_features(df_sample)
        
        # Display results
        features_to_show = ['score_avg', 'feat_avg_semantic', 'feat_max_semantic', 'feat_anchors_covered', 'feat_avg_jaccard']
        print("\nResults for sample data:")
        print(df_featured[['student_answer'] + features_to_show].head().to_string())
        
    except Exception as e:
        import traceback
        traceback.print_exc()
