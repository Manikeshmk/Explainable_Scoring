"""
ExplainGrade Metrics Calculator
Computes performance scores: Pearson, Accuracy, F1, MAE, RMSE, etc.
"""

import json
import pandas as pd
import numpy as np
from scipy import stats
from sklearn.metrics import (
    mean_squared_error, 
    mean_absolute_error,
    f1_score,
    accuracy_score,
    confusion_matrix,
    precision_score,
    recall_score
)


class MetricsCalculator:
    def __init__(self):
        self.results = {
            'pearson': {},
            'accuracy': {},
            'f1_score': {},
            'mae': {},
            'rmse': {},
            'correlation': {},
            'confusion_matrix': {},
            'precision': {},
            'recall': {}
        }
    
    def load_grades(self, grades_file='grades.json'):
        """Load grades from grader output"""
        try:
            with open(grades_file) as f:
                data = json.load(f)
            print(f"✓ Loaded {len(data)} grade records")
            return data
        except FileNotFoundError:
            print(f"✗ File not found: {grades_file}")
            return None
    
    def load_expected_scores(self, csv_file=None):
        """Load expected scores from dataset CSV"""
        try:
            if csv_file is None:
                # Try to find any test CSV
                csv_file = 'squad_test_variations.csv'
            
            df = pd.read_csv(csv_file)
            print(f"✓ Loaded {len(df)} expected scores from {csv_file}")
            return df
        except FileNotFoundError:
            print(f"✗ CSV file not found: {csv_file}")
            return None
    
    def calculate_pearson_correlation(self, predicted_scores, expected_scores):
        """
        Calculate Pearson correlation coefficient
        Measures linear relationship (-1 to 1, higher is better)
        """
        if len(predicted_scores) < 2:
            return None
        
        try:
            correlation, p_value = stats.pearsonr(predicted_scores, expected_scores)
            return {
                'correlation': float(correlation),
                'p_value': float(p_value),
                'interpretation': self._interpret_correlation(correlation)
            }
        except:
            return None
    
    def calculate_spearman_correlation(self, predicted_scores, expected_scores):
        """
        Calculate Spearman rank correlation
        Non-parametric version of Pearson
        """
        try:
            correlation, p_value = stats.spearmanr(predicted_scores, expected_scores)
            return {
                'correlation': float(correlation),
                'p_value': float(p_value)
            }
        except:
            return None
    
    def calculate_accuracy(self, predicted_scores, expected_scores, threshold=0.5):
        """
        Calculate accuracy (percentage of correct predictions)
        Treats as binary: correct if prediction within threshold of expected
        """
        differences = np.abs(np.array(predicted_scores) - np.array(expected_scores))
        correct = np.sum(differences <= threshold)
        accuracy = (correct / len(predicted_scores)) * 100
        
        return {
            'accuracy': float(accuracy),
            'threshold': threshold,
            'correct_predictions': int(correct),
            'total_predictions': len(predicted_scores)
        }
    
    def calculate_mae(self, predicted_scores, expected_scores):
        """
        Mean Absolute Error
        Average absolute difference between predicted and expected (0 is perfect)
        """
        mae = mean_absolute_error(expected_scores, predicted_scores)
        return {
            'mae': float(mae),
            'interpretation': f'On average, predictions are off by {mae:.2f} points'
        }
    
    def calculate_rmse(self, predicted_scores, expected_scores):
        """
        Root Mean Squared Error
        Penalizes larger errors more heavily (0 is perfect)
        """
        mse = mean_squared_error(expected_scores, predicted_scores)
        rmse = np.sqrt(mse)
        return {
            'rmse': float(rmse),
            'mse': float(mse)
        }
    
    def calculate_r_squared(self, predicted_scores, expected_scores):
        """
        R-Squared (Coefficient of Determination)
        Proportion of variance explained (0 to 1, higher is better)
        """
        ss_res = np.sum((np.array(expected_scores) - np.array(predicted_scores)) ** 2)
        ss_tot = np.sum((np.array(expected_scores) - np.mean(expected_scores)) ** 2)
        r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
        return {
            'r_squared': float(r_squared),
            'interpretation': f'{r_squared*100:.1f}% of variance explained'
        }
    
    def calculate_grade_agreement(self, predicted_scores, expected_scores):
        """
        Calculate percentage of predictions in same grade level
        Grade levels: F(0-2), D(2-4), C(4-6), B(6-8), A(8-10)
        """
        def get_grade(score):
            if score < 2: return 'F'
            elif score < 4: return 'D'
            elif score < 6: return 'C'
            elif score < 8: return 'B'
            else: return 'A'
        
        predicted_grades = [get_grade(s) for s in predicted_scores]
        expected_grades = [get_grade(s) for s in expected_scores]
        
        agreement = sum(p == e for p, e in zip(predicted_grades, expected_grades))
        agreement_pct = (agreement / len(predicted_grades)) * 100
        
        return {
            'grade_agreement': float(agreement_pct),
            'agreed': int(agreement),
            'total': len(predicted_grades),
            'interpretation': f'{agreement_pct:.1f}% of predictions in same grade level'
        }
    
    def _interpret_correlation(self, r):
        """Interpret Pearson correlation value"""
        abs_r = abs(r)
        if abs_r >= 0.9:
            return 'Very strong correlation'
        elif abs_r >= 0.7:
            return 'Strong correlation'
        elif abs_r >= 0.5:
            return 'Moderate correlation'
        elif abs_r >= 0.3:
            return 'Weak correlation'
        else:
            return 'Very weak or no correlation'
    
    def calculate_all_metrics(self, predicted_scores, expected_scores):
        """Calculate all metrics at once"""
        print("\n" + "="*60)
        print("📊 CALCULATING PERFORMANCE METRICS")
        print("="*60)
        
        metrics = {
            'pearson': self.calculate_pearson_correlation(predicted_scores, expected_scores),
            'spearman': self.calculate_spearman_correlation(predicted_scores, expected_scores),
            'accuracy': self.calculate_accuracy(predicted_scores, expected_scores),
            'mae': self.calculate_mae(predicted_scores, expected_scores),
            'rmse': self.calculate_rmse(predicted_scores, expected_scores),
            'r_squared': self.calculate_r_squared(predicted_scores, expected_scores),
            'grade_agreement': self.calculate_grade_agreement(predicted_scores, expected_scores),
            'basic_stats': {
                'predicted_mean': float(np.mean(predicted_scores)),
                'predicted_std': float(np.std(predicted_scores)),
                'expected_mean': float(np.mean(expected_scores)),
                'expected_std': float(np.std(expected_scores))
            }
        }
        
        return metrics
    
    def print_metrics_report(self, metrics):
        """Print formatted metrics report"""
        print("\n" + "="*60)
        print("📈 PERFORMANCE REPORT")
        print("="*60)
        
        # Pearson Correlation
        if metrics['pearson']:
            p = metrics['pearson']
            print(f"\n🔗 Pearson Correlation: {p['correlation']:.4f}")
            print(f"   ({p['interpretation']})")
            print(f"   P-value: {p['p_value']:.6f}")
        
        # Spearman Correlation
        if metrics['spearman']:
            s = metrics['spearman']
            print(f"\n📊 Spearman Correlation: {s['correlation']:.4f}")
            print(f"   P-value: {s['p_value']:.6f}")
        
        # Accuracy
        if metrics['accuracy']:
            a = metrics['accuracy']
            print(f"\n✓ Accuracy: {a['accuracy']:.2f}%")
            print(f"   {a['correct_predictions']}/{a['total_predictions']} predictions correct")
        
        # Error Metrics
        if metrics['mae']:
            print(f"\n📏 Mean Absolute Error (MAE): {metrics['mae']['mae']:.4f}")
            print(f"   {metrics['mae']['interpretation']}")
        
        if metrics['rmse']:
            print(f"\n📏 Root Mean Squared Error (RMSE): {metrics['rmse']['rmse']:.4f}")
        
        # R-Squared
        if metrics['r_squared']:
            r = metrics['r_squared']
            print(f"\n📈 R-Squared (R²): {r['r_squared']:.4f}")
            print(f"   {r['interpretation']}")
        
        # Grade Agreement
        if metrics['grade_agreement']:
            g = metrics['grade_agreement']
            print(f"\n🎓 Grade Agreement: {g['grade_agreement']:.2f}%")
            print(f"   {g['agreed']}/{g['total']} predictions in same grade level")
        
        # Basic Statistics
        if metrics['basic_stats']:
            bs = metrics['basic_stats']
            print(f"\n📊 Statistics:")
            print(f"   Predicted: μ={bs['predicted_mean']:.2f}, σ={bs['predicted_std']:.2f}")
            print(f"   Expected:  μ={bs['expected_mean']:.2f}, σ={bs['expected_std']:.2f}")
        
        print("\n" + "="*60)
    
    def save_metrics_json(self, metrics, filename='metrics.json'):
        """Save metrics to JSON file"""
        with open(filename, 'w') as f:
            json.dump(metrics, f, indent=2)
        print(f"\n✓ Metrics saved to {filename}")
    
    def create_metrics_html(self, metrics, filename='test_results.json'):
        """Create JSON for web display"""
        with open(filename, 'w') as f:
            json.dump(metrics, f, indent=2)
        return metrics


def calculate_pearson_for_dataset(dataset_name='squad'):
    """
    Calculate Pearson score for a specific dataset
    
    Args:
        dataset_name: Either 'squad' or 'mohler'
    """
    import sys
    
    calc = MetricsCalculator()
    
    # Determine which CSV file to use
    if dataset_name.lower() == 'squad':
        csv_file = 'squad_test_variations.csv'
    elif dataset_name.lower() == 'mohler':
        csv_file = 'mohler_dataset_edited.csv'
    else:
        print(f"✗ Unknown dataset: {dataset_name}")
        return None
    
    print("\n" + "="*60)
    print(f"🧪 PEARSON CALCULATION FOR {dataset_name.upper()}")
    print("="*60)
    
    # Load grades
    grades = calc.load_grades('grades.json')
    if grades is None:
        print("⚠ Run local_grader.py first to generate grades.json")
        return None
    
    # Load expected scores for specific dataset
    test_data = calc.load_expected_scores(csv_file)
    if test_data is None:
        print(f"✗ CSV file not found: {csv_file}")
        return None
    
    # Extract predicted scores
    if isinstance(grades, list) and len(grades) > 0:
        predicted = [g.get('score', 0) if isinstance(g, dict) else 0 for g in grades]
    else:
        predicted = [5.0] * len(test_data)
    
    # Extract expected scores
    if 'expected_score' in test_data.columns:
        expected = test_data['expected_score'].tolist()
    elif 'score_avg' in test_data.columns:
        expected = test_data['score_avg'].tolist()
    else:
        print("✗ No expected score column found in dataset")
        return None
    
    # Make sure we have same length
    min_len = min(len(predicted), len(expected))
    predicted = predicted[:min_len]
    expected = expected[:min_len]
    
    # Calculate Pearson specifically
    pearson_result = calc.calculate_pearson_correlation(predicted, expected)
    
    if pearson_result:
        print(f"\n📊 PEARSON CORRELATION: {pearson_result['correlation']:.4f}")
        print(f"   Interpretation: {pearson_result['interpretation']}")
        print(f"   P-value: {pearson_result['p_value']:.6f}")
        print(f"   Samples: {min_len}")
        return pearson_result
    else:
        print("✗ Failed to calculate Pearson correlation")
        return None


def main():
    """Main execution - calculates Pearson for both datasets"""
    import sys
    
    print("ExplainGrade Pearson Score Calculator")
    print("="*60)
    
    # Calculate for both datasets
    results = {}
    
    # Test on SQuAD
    results['squad'] = calculate_pearson_for_dataset('squad')
    
    # Test on Mohler
    results['mohler'] = calculate_pearson_for_dataset('mohler')
    
    # Summary
    print("\n" + "="*60)
    print("📈 PEARSON SCORE SUMMARY")
    print("="*60)
    
    if results['squad']:
        print(f"\n✓ SQuAD:   Pearson = {results['squad']['correlation']:.4f}")
    else:
        print(f"\n✗ SQuAD:   Failed to calculate")
    
    if results['mohler']:
        print(f"✓ Mohler:  Pearson = {results['mohler']['correlation']:.4f}")
    else:
        print(f"✗ Mohler:  Failed to calculate")
    
    # Save detailed results
    with open('pearson_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\n✓ Results saved to pearson_results.json")
    
    print("\n✅ Pearson calculation complete!")


if __name__ == "__main__":
    main()
