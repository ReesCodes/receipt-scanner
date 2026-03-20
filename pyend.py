import subprocess

def scan_receipt(image_path):
    # Call the external Node.js script to process the receipt image
    result = subprocess.run(['node', 'cli.js', image_path], capture_output=True, text=True)
    
    if result.returncode != 0:
        raise Exception(f"Error processing receipt: {result.stderr}")
    
    return result.stdout.strip()

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("Usage: python main.js <path_to_receipt_image>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    print(f"Processing receipt image: {image_path}")
    try:
        receipt_data = scan_receipt(image_path)
        print(f"Extracted Receipt Data:\n{receipt_data}")
    except Exception as e:
        print(str(e))