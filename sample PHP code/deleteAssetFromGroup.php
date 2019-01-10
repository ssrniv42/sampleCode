<?php
//Track24 2013
//Author : Steven Crawford
//Co-Author: Masoud Omran / Jing Guan
//G.U.I v2.5
//Delete Asset from a group Mechanics

session_start(); include $_SESSION['SYSCON_URL'];
					
	$owner = $_SESSION['SESS_CLIENT_ID'];
	$profileAssetId = $_GET['iMEi'];
	$profileAssetName = $_GET['assetName'];
	
	$status = array();
	
	$qryUpdateAssetProfileData2 = "UPDATE assets
									SET device_group = 'Main'
									WHERE iMEi = '$profileAssetId' AND cl_id = '$owner'";
	$resultUpdateAssetProfileData2 = mysql_query($qryUpdateAssetProfileData2);
	
	if($resultUpdateAssetProfileData2){
		array_push($status , array('success'=>'Asset "'.$profileAssetName.'" removed!'));
		array_push($status , array('debug'=>'Asset "'.$profileAssetName.'" removed!'));
	}
	else{
		array_push($status , array('error'=>'Faild to remove asset "'.$profileAssetName.'"!'));
		array_push($status , array('debug'=>'Faild to remove asset "'.$profileAssetName.'"! SQL error : '.mysql_error()));
	}

	echo json_encode(array("status" => $status));
	unset($_GET['iMEi'], $_GET['assetName']);
	exit();	
?>